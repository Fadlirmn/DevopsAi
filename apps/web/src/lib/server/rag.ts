// Server-to-server proxy to the FastAPI RAG service (PRD.md §6 — the browser
// never calls it directly). One place for the base URL, a timeout, and a
// guard against non-JSON upstream bodies (e.g. a proxy's HTML 502 page).
import { json, error } from '@sveltejs/kit';

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL ?? 'http://localhost:8000';
const TIMEOUT_MS = 30_000;

/** `path` must already be safe — encode any user-supplied segment before calling. */
export async function proxyToRag(path: string, init: RequestInit = {}): Promise<Response> {
	let upstream: Response;
	try {
		upstream = await fetch(`${RAG_SERVICE_URL}${path}`, {
			...init,
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch {
		throw error(503, 'rag service unavailable');
	}

	let data: unknown;
	try {
		data = await upstream.json();
	} catch {
		throw error(502, 'bad upstream response');
	}
	return json(data, { status: upstream.status });
}
