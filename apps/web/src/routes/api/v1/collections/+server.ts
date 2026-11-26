// Public /collections per PRD.md §8. From the VPS RAG service when it is
// configured and up; otherwise the single demo collection (serverless demo or
// stored example) so the chat still renders.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchRag, toResponse, DEMO_FALLBACK, RAG_CONFIGURED } from '#lib/server/rag';
import { DEMO_COLLECTION } from '#lib/server/demo-fixture';
import { serverlessDemoEnabled } from '#lib/server/demo/chat';

export const GET: RequestHandler = async (event) => {
	const serverless = await serverlessDemoEnabled();
	const hasFallback = DEMO_FALLBACK || serverless;
	if (RAG_CONFIGURED) {
		// Runs on page load: with a fallback available a hanging VPS must not stall it.
		const r = await fetchRag(event, '/collections', {}, hasFallback ? 3_000 : 8_000);
		if (r && r.status < 500) return toResponse(r);
	}
	if (serverless)
		return json([
			{
				...DEMO_COLLECTION,
				description: 'Demo: NIST SP 800-61 Rev. 2 (Computer Security Incident Handling Guide).'
			}
		]);
	if (DEMO_FALLBACK) return json([DEMO_COLLECTION]);
	throw error(503, 'rag service unavailable');
};
