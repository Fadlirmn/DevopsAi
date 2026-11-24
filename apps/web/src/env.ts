// Explicit env var declarations — required by this @sveltejs/kit version
// (replaces the old "anything prefixed PUBLIC_ in .env" auto-detection).
// Only the client-exposed Firebase config needs declaring here; server-only
// vars (RAG_SERVICE_URL, FIREBASE_PROJECT_ID, ADMIN_UIDS) are read directly
// via process.env in src/lib/server/* — no client exposure to declare.
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	PUBLIC_FIREBASE_API_KEY: { public: true },
	PUBLIC_FIREBASE_AUTH_DOMAIN: { public: true },
	PUBLIC_FIREBASE_PROJECT_ID: { public: true }
});
