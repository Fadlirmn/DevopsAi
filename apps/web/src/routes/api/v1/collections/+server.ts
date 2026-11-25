// Public /collections per PRD.md §8. Proxies server-to-server to the RAG service.
import type { RequestHandler } from './$types';
import { proxyToRag } from '#lib/server/rag';

export const GET: RequestHandler = () => proxyToRag('/collections');
