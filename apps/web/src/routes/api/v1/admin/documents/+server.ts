// Admin /documents per PRD.md §8.
// Auth is enforced upstream in hooks.server.ts (PRD.md §9 K-02) — this
// handler only runs for an already-verified admin request. The RAG service
// itself still trusts any caller; it relies on not being publicly reachable.
import type { RequestHandler } from './$types';
import { proxyToRag } from '#lib/server/rag';

export const GET: RequestHandler = () => proxyToRag('/admin/documents');
