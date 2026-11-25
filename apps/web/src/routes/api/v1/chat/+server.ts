// Public /chat per PRD.md §8. Proxies server-to-server to the FastAPI RAG
// service — the browser never calls it directly (PRD.md §6 Vercel+VPS split).
// Rate limiting happens in the RAG service (Postgres-backed, per visitor IP
// forwarded by fetchRag); a 429 passes through with its Retry-After.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchRag, toResponse, DEMO_FALLBACK } from '#lib/server/rag';
import { demoAnswer } from '#lib/server/demo-fixture';

export const POST: RequestHandler = async (event) => {
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw error(400, 'invalid JSON body');
	}
	const r = await fetchRag(event, '/chat', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	// Fallback only when the backend is unreachable — never to hide a 429,
	// a budget stop (503 with detail) or a validation error.
	if (r) return toResponse(r);
	if (DEMO_FALLBACK) return json(demoAnswer(crypto.randomUUID()));
	throw error(503, 'rag service unavailable');
};
