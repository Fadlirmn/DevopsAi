// Public /chat per PRD.md §8. Three backends, tried in order:
//   1. the VPS RAG service (RAG_SERVICE_URL) — full corpus, Postgres rate limit
//   2. the serverless demo inside SvelteKit (LLM_PROVIDER set) — NIST only,
//      Upstash rate limit; used on a Vercel-only deploy or when the VPS is down
//   3. the stored, labelled example (DEMO_FALLBACK=1) — no AI at all
// A VPS that answers (even with 429 / budget 503 / provider 503) is never
// replaced by a fallback: its real message is more honest.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchRag, toResponse, DEMO_FALLBACK, RAG_CONFIGURED } from '#lib/server/rag';
import { demoAnswer } from '#lib/server/demo-fixture';
import { serverlessChat, serverlessDemoEnabled } from '#lib/server/demo/chat';

const HEALTH_PROBE_MS = 3_000;

// Vercel: the serverless demo makes two LLM calls (rewrite + answer); give the
// function room beyond the default. Ignored by adapter-node (Docker/VPS).
export const config = { maxDuration: 60 };

export const POST: RequestHandler = async (event) => {
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'invalid JSON body');
	}

	if (RAG_CONFIGURED) {
		const hasFallback = DEMO_FALLBACK || (await serverlessDemoEnabled());
		// With a fallback available, probe /health first so a hanging VPS costs
		// ~3 s instead of the full /chat timeout.
		const up = !hasFallback || (await fetchRag(event, '/health', {}, HEALTH_PROBE_MS)) !== null;
		if (up) {
			const r = await fetchRag(event, '/chat', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (r) return toResponse(r);
		}
	}
	if (await serverlessDemoEnabled()) return serverlessChat(event, body);
	if (DEMO_FALLBACK) return json(demoAnswer(crypto.randomUUID()));
	throw error(503, 'rag service unavailable');
};
