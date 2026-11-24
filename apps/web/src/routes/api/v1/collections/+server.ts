// Public /collections per PRD.md §8. Proxies server-to-server to the RAG service.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL ?? 'http://localhost:8000';

export const GET: RequestHandler = async () => {
	let upstream: Response;
	try {
		upstream = await fetch(`${RAG_SERVICE_URL}/collections`);
	} catch {
		throw error(503, 'rag service unavailable');
	}
	const data = await upstream.json();
	return json(data, { status: upstream.status });
};
