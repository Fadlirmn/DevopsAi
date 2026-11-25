// Admin /coverage-gaps per PRD.md §8 (K-17). Auth enforced upstream in
// hooks.server.ts (PRD.md §9 K-02).
import type { RequestHandler } from './$types';
import { proxyToRag } from '#lib/server/rag';

export const GET: RequestHandler = () => proxyToRag('/admin/coverage-gaps');
