// Admin /settings per PRD.md §5. Auth enforced upstream in hooks.server.ts
// (PRD.md §9 K-02). Read-only: there's no settings table yet.
import type { RequestHandler } from './$types';
import { proxyToRag } from '#lib/server/rag';

export const GET: RequestHandler = () => proxyToRag('/admin/settings');
