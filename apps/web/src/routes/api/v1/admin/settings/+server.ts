// Admin /settings per PRD.md §5. No auth check yet — see K-02 note on the
// sibling /admin/documents route. Read-only: there's no settings table yet.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL ?? 'http://localhost:8000';

export const GET: RequestHandler = async () => {
	let upstream: Response;
	try {
		upstream = await fetch(`${RAG_SERVICE_URL}/admin/settings`);
	} catch {
		throw error(503, 'rag service unavailable');
	}
	const data = await upstream.json();
	return json(data, { status: upstream.status });
};
