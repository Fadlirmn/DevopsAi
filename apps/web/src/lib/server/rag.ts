// Server-to-server calls to the FastAPI RAG service (PRD §6 — the browser never
// calls it directly). Locally/VPS that's http://rag:8000 on the Docker network;
// in the Vercel demo it's the VPS over HTTPS (RAG_SERVICE_URL), authenticated
// with RAG_API_KEY.
//
// Headers the RAG service trusts only because the key authenticates us:
//   x-internal-key  shared secret (RAG_API_KEY)
//   x-client-ip     the visitor's IP, for the per-IP rate limit
//   x-rate-exempt   "1" for a verified admin session (hooks.server.ts)
import { json, error, type RequestEvent } from '@sveltejs/kit';

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL ?? 'http://localhost:8000';
const RAG_API_KEY = process.env.RAG_API_KEY ?? '';
const TIMEOUT_MS = 30_000;

/** Vercel demo: serve the labelled fixture when the VPS can't be reached (PRD §6). */
export const DEMO_FALLBACK = process.env.DEMO_FALLBACK === '1';

export type RagResult = { status: number; data: unknown; retryAfter: string | null };

/** null = RAG unreachable, timed out, or answered with a non-JSON body. */
export async function fetchRag(
	event: RequestEvent,
	path: string,
	init: RequestInit = {},
	timeoutMs = TIMEOUT_MS
): Promise<RagResult | null> {
	const headers = new Headers(init.headers);
	if (RAG_API_KEY) headers.set('x-internal-key', RAG_API_KEY);
	try {
		headers.set('x-client-ip', event.getClientAddress());
	} catch {
		// no client address (e.g. prerender) — RAG falls back to the socket peer
	}
	if (event.locals.adminUid) headers.set('x-rate-exempt', '1');

	let upstream: Response;
	try {
		upstream = await fetch(`${RAG_SERVICE_URL}${path}`, {
			...init,
			headers,
			signal: AbortSignal.timeout(timeoutMs)
		});
	} catch {
		return null;
	}
	try {
		return {
			status: upstream.status,
			data: await upstream.json(),
			retryAfter: upstream.headers.get('retry-after')
		};
	} catch {
		return null;
	}
}

export function toResponse(r: RagResult): Response {
	const headers: Record<string, string> = {};
	if (r.retryAfter) headers['retry-after'] = r.retryAfter;
	return json(r.data, { status: r.status, headers });
}

/** `path` must already be safe — encode any user-supplied segment before calling. */
export async function proxyToRag(
	event: RequestEvent,
	path: string,
	init: RequestInit = {}
): Promise<Response> {
	const r = await fetchRag(event, path, init);
	if (!r) throw error(503, 'rag service unavailable');
	return toResponse(r);
}
