// Serverless demo RAG: the whole /chat pipeline inside SvelteKit, for a
// Vercel deployment with no VPS. One document (NIST SP 800-61r2), bundled as
// nist-index.json (services/rag/scripts/export_demo_index.py). When a VPS
// is configured (RAG_SERVICE_URL), /api/v1/chat uses it instead and this
// module is only the fallback.
//
// Pipeline: validate -> rate limit -> cache -> spend cap -> LLM rewrites the
// question into English keywords (NONE = off-topic, stop) -> BM25 top 6 ->
// LLM answers from the passages as JSON -> citations enforced (no valid
// citation = fixed abstain text).
import { json, error, type RequestEvent } from '@sveltejs/kit';
import { demoConfig, type DemoConfig } from './config';
import { Bm25 } from './bm25';
import {
	ABSTAIN_TEXT,
	REFUSAL_TEXT,
	REWRITE_PROMPT,
	SYSTEM_PROMPT,
	buildUserMessage,
	parseAnswer,
	type Passage
} from './grounding';
import { complete, ProviderError, type Completion } from './providers';
import { addSpend, getCachedAnswer, hitRateLimit, setCachedAnswer, spentToday } from './limits';
import index from './nist-index.json';

export type DemoChunk = {
	chunkId: string;
	ordinal: number;
	page: number | null;
	heading: string | null;
	content: string;
};
export type DemoDoc = {
	documentId: string;
	title: string;
	sourceUrl: string;
	license: string;
	chunks: DemoChunk[];
};

export const DEMO_DOC = index as DemoDoc;
export const DEMO_SLUG = 'it-ops';
const TOP_K = 6;
const search = new Bm25(DEMO_DOC.chunks.map((c) => `${c.heading ?? ''} ${c.content}`));

export const serverlessDemoEnabled = (): boolean => demoConfig() !== null;

function humanWait(s: number): string {
	if (s < 90) return `${s} detik`;
	if (s < 5400) return `${Math.round(s / 60)} menit`;
	return `${Math.round(s / 3600)} jam`;
}

function cost(c: DemoConfig, calls: Completion[]): number {
	if (c.priceIn === null || c.priceOut === null) return 0;
	return calls.reduce(
		(sum, r) => sum + (r.inputTokens * c.priceIn! + r.outputTokens * c.priceOut!) / 1e6,
		0
	);
}

function payload(
	answer: string,
	cited: DemoChunk[],
	grounded: boolean,
	requestId: string,
	calls: Completion[]
) {
	return {
		answer,
		citations: cited.map((ch, i) => ({
			marker: i + 1,
			chunkId: ch.chunkId,
			documentId: DEMO_DOC.documentId,
			title: DEMO_DOC.title,
			heading: ch.heading,
			page: ch.page,
			excerpt: ch.content.slice(0, 280)
		})),
		requestId,
		usage: {
			inputTokens: calls.reduce((s, r) => s + r.inputTokens, 0),
			outputTokens: calls.reduce((s, r) => s + r.outputTokens, 0)
		},
		grounded,
		cacheHit: false
	};
}

export async function serverlessChat(event: RequestEvent, body: unknown): Promise<Response> {
	const c = demoConfig();
	if (!c) throw error(503, 'demo AI not configured');

	const b = (body ?? {}) as {
		collectionSlug?: unknown;
		message?: unknown;
		clientRequestId?: unknown;
	};
	const message = typeof b.message === 'string' ? b.message.trim() : '';
	if (!message || message.length > 2000)
		return json({ detail: 'message must be 1-2000 characters' }, { status: 400 });
	if (b.collectionSlug !== DEMO_SLUG)
		return json({ detail: 'collection not found' }, { status: 404 });
	const requestId = typeof b.clientRequestId === 'string' ? b.clientRequestId : crypto.randomUUID();

	if (!event.locals.adminUid) {
		let ip = 'unknown';
		try {
			ip = event.getClientAddress();
		} catch {
			// no address available; everyone shares one bucket (fail safe)
		}
		const retry = await hitRateLimit(ip, c.salt, c.perMinute, c.perDay);
		if (retry !== null) {
			return json(
				{ detail: `Terlalu banyak pertanyaan. Coba lagi dalam ${humanWait(retry)}.` },
				{ status: 429, headers: { 'retry-after': String(retry) } }
			);
		}
	}

	const pipeline = `demo-v1|${c.provider}:${c.model}`;
	const cachedAnswer = await getCachedAnswer(pipeline, message);
	if (cachedAnswer) return json({ ...cachedAnswer, requestId, cacheHit: true });

	if (c.dailySpendCapUsd !== null && (await spentToday()) >= c.dailySpendCapUsd) {
		return json({ detail: 'Batas biaya AI harian tercapai. Coba lagi besok.' }, { status: 503 });
	}

	const calls: Completion[] = [];
	try {
		// 1) English keywords for an English corpus; NONE = clearly off-topic.
		const rewrite = await complete(c, REWRITE_PROMPT, message, false);
		calls.push(rewrite);
		const keywords = rewrite.refused ? 'NONE' : rewrite.text.trim().split('\n')[0];

		let result = payload(ABSTAIN_TEXT, [], false, requestId, calls);
		if (!/^NONE\b/i.test(keywords)) {
			// 2) BM25 over the original question plus the keywords.
			const hits = search
				.search(`${message} ${keywords}`, TOP_K)
				.filter(([, score]) => score >= c.minScore)
				.map(([i]) => DEMO_DOC.chunks[i]);

			if (hits.length) {
				// 3) Answer strictly from the passages, as JSON with citations.
				const passages: Passage[] = hits.map((h) => ({
					title: DEMO_DOC.title,
					heading: h.heading,
					page: h.page,
					content: h.content
				}));
				const answer = await complete(c, SYSTEM_PROMPT, buildUserMessage(message, passages), true);
				calls.push(answer);
				if (answer.refused) {
					result = payload(REFUSAL_TEXT, [], false, requestId, calls);
				} else {
					let parsed;
					try {
						parsed = parseAnswer(answer.text, hits.length);
					} catch {
						throw new ProviderError('bad_output');
					}
					result = payload(
						parsed.text,
						parsed.cited.map((i) => hits[i]),
						parsed.grounded,
						requestId,
						calls
					);
				}
			}
		}

		await addSpend(cost(c, calls));
		const { requestId: _omit, ...cacheable } = result;
		void _omit;
		await setCachedAnswer(pipeline, message, cacheable);
		return json(result);
	} catch (e) {
		await addSpend(cost(c, calls)); // tokens already used still count
		if (e instanceof ProviderError) {
			console.warn('[demo] provider unavailable:', e.reason, e.message.slice(0, 200));
			return json(
				{ detail: 'Layanan AI sedang tidak tersedia. Coba lagi sebentar.' },
				{ status: 503 }
			);
		}
		throw e;
	}
}

/** /sources/demo-nist in the same shape the VPS RAG returns. */
export function demoSource() {
	return {
		documentId: DEMO_DOC.documentId,
		title: DEMO_DOC.title,
		collectionTitle: 'IT Ops & Incident Response',
		collectionSlug: DEMO_SLUG,
		versionNumber: 1,
		sourceUrl: DEMO_DOC.sourceUrl,
		license: DEMO_DOC.license,
		chunks: DEMO_DOC.chunks
	};
}
