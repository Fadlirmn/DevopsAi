// Public /chat per PRD.md §8. Proxies server-to-server to the FastAPI RAG
// service — the browser never calls it directly (PRD.md §6 Vercel+VPS split).
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { proxyToRag } from '#lib/server/rag';

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'invalid JSON body');
	}
	return proxyToRag('/chat', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
};
