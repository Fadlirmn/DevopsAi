// Admin /settings per PRD.md §5. Auth enforced upstream in hooks.server.ts
// (PRD.md §9 K-02). Read-only: there's no settings table yet.
// From the VPS RAG service when it is configured and up; otherwise (Vercel
// without a VPS, or the VPS down) the serverless demo's own config + live
// Redis/provider checks. ?test=1 also checks the models with the provider.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchRag, toResponse, RAG_CONFIGURED } from '#lib/server/rag';
import { serverlessConfigured, serverlessSettings } from '#lib/server/demo/settings';

export const GET: RequestHandler = async (event) => {
	const serverless = serverlessConfigured();
	if (RAG_CONFIGURED) {
		const r = await fetchRag(event, '/admin/settings', {}, serverless ? 3_000 : 30_000);
		if (r && (r.status < 500 || !serverless)) return toResponse(r);
	}
	if (serverless) return json(await serverlessSettings(event.url.searchParams.has('test')));
	throw error(503, 'rag service unavailable');
};
