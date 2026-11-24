// Public /sources/:id detail view. Proxies server-to-server to the RAG
// service, which enforces public visibility itself (PRD.md §5).
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL ?? 'http://localhost:8000';

export const GET: RequestHandler = async ({ params }) => {
	let upstream: Response;
	try {
		upstream = await fetch(`${RAG_SERVICE_URL}/sources/${params.id}`);
	} catch {
		throw error(503, 'rag service unavailable');
	}
	const data = await upstream.json();
	return json(data, { status: upstream.status });
};
