// Establishes the admin session cookie from a freshly-signed-in Firebase ID
// token (PRD.md §9 K-02). The cookie IS the ID token — hooks.server.ts
// re-verifies it on every protected request, it's never trusted as-is.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyAdminIdToken } from '#lib/server/firebase-auth';

// import.meta.env.DEV instead of $app/environment's `dev` — the latter
// doesn't resolve under the currently-installed svelte-check against this
// @sveltejs/kit version (see README dev-tooling note); this is Vite's own
// standard and works identically.
const dev = import.meta.env.DEV;

const SESSION_COOKIE = 'admin_session';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json().catch(() => null);
	const idToken = body?.idToken;
	if (typeof idToken !== 'string' || !idToken) throw error(400, 'idToken required');

	const identity = await verifyAdminIdToken(idToken);
	if (!identity) throw error(403, 'not an allowlisted admin account');

	// Firebase ID tokens are valid ~1h; match the cookie to that, not longer.
	cookies.set(SESSION_COOKIE, idToken, {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		maxAge: 60 * 55
	});

	return json({ uid: identity.uid, email: identity.email });
};
