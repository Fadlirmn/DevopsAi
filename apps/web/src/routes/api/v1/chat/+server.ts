// Public /chat per PRD.md §8. Proxies server-to-server to the FastAPI RAG
// service — the browser never calls it directly (PRD.md §6 Vercel+VPS split).
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL ?? 'http://localhost:8000';

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'invalid JSON body');
	}

	let upstream: Response;
	try {
		upstream = await fetch(`${RAG_SERVICE_URL}/chat`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
	} catch {
		throw error(503, 'rag service unavailable');
	}

	const data = await upstream.json();
	return json(data, { status: upstream.status });
};
