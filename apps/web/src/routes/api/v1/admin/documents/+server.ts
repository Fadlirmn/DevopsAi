// Admin /documents per PRD.md §8.
// Auth is enforced upstream in hooks.server.ts (PRD.md §9 K-02) — this
// handler only runs for an already-verified admin request. The RAG service
// itself still trusts any caller; it relies on not being publicly reachable.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL ?? 'http://localhost:8000';

export const GET: RequestHandler = async () => {
	let upstream: Response;
	try {
		upstream = await fetch(`${RAG_SERVICE_URL}/admin/documents`);
	} catch {
		throw error(503, 'rag service unavailable');
	}
	const data = await upstream.json();
	return json(data, { status: upstream.status });
};
