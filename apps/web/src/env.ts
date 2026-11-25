// Explicit env var declarations — required by this @sveltejs/kit version
// (replaces the old "anything prefixed PUBLIC_ in .env" auto-detection).
// Only the client-exposed Firebase config needs declaring here; server-only
// vars (RAG_SERVICE_URL, FIREBASE_PROJECT_ID, ADMIN_UIDS) are read directly
// via process.env in src/lib/server/* — no client exposure to declare.
//
// Read at startup (not inlined at build — `static` defaults to false), so one
// Docker image works for any Firebase project. Optional (`?? ''`) so the
// image builds without them and the public demo runs unconfigured; /login
// then just fails and /admin stays locked (fails closed server-side).
import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (v: string | undefined) => v ?? '';

export const variables = defineEnvVars({
	PUBLIC_FIREBASE_API_KEY: { public: true, schema: optional },
	PUBLIC_FIREBASE_AUTH_DOMAIN: { public: true, schema: optional },
	PUBLIC_FIREBASE_PROJECT_ID: { public: true, schema: optional }
});
