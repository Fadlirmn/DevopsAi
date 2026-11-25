// Public /sources/:id detail view. Proxies server-to-server to the RAG
// service, which enforces public visibility itself (PRD.md §5).
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { proxyToRag } from '#lib/server/rag';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: RequestHandler = ({ params }) => {
	// Must validate before building the upstream URL: params are decoded, so
	// `..%2Fadmin%2Fdocuments` would arrive as `../admin/documents` and fetch()
	// would normalize it onto the unauthenticated RAG /admin/* routes.
	if (!UUID_RE.test(params.id)) throw error(404, 'source not found');
	return proxyToRag(`/sources/${encodeURIComponent(params.id)}`);
};
