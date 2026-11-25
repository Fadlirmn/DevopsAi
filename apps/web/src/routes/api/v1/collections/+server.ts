// Public /collections per PRD.md §8. Proxies server-to-server to the RAG service.
// Vercel demo mode: if the VPS is unreachable, list the demo collection so the
// chat still renders (answers then come from the labelled fixture).
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchRag, toResponse, DEMO_FALLBACK } from '#lib/server/rag';
import { DEMO_COLLECTION } from '#lib/server/demo-fixture';

export const GET: RequestHandler = async (event) => {
	// Short timeout in demo mode: this runs on page load, a hanging VPS must not stall it.
	const r = await fetchRag(event, '/collections', {}, DEMO_FALLBACK ? 3_000 : 8_000);
	if (r && r.status < 500) return toResponse(r);
	if (DEMO_FALLBACK) return json([DEMO_COLLECTION]);
	throw error(503, 'rag service unavailable');
};
