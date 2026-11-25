// Gates /admin pages and /api/v1/admin/* endpoints behind a verified Firebase
// ID token (PRD.md §9 K-02). Verifies fresh on every request — no trusting a
// server-side session cache (PRD.md §6 "admin session" note).
import type { Handle } from '@sveltejs/kit';
import { verifyAdminIdToken } from '#lib/server/firebase-auth';

const SESSION_COOKIE = 'admin_session';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	const identity = token ? await verifyAdminIdToken(token) : null;
	event.locals.adminUid = identity?.uid ?? null;
	event.locals.adminEmail = identity?.email ?? null;
	event.locals.adminName = identity?.name ?? null;
	event.locals.adminSessionExp = identity?.exp ?? null;

	const path = event.url.pathname;
	const isAdminApi = path.startsWith('/api/v1/admin/');
	const isAdminPage = path.startsWith('/admin');

	if ((isAdminApi || isAdminPage) && !identity) {
		if (token) event.cookies.delete(SESSION_COOKIE, { path: '/' });
		if (isAdminApi) {
			return new Response(
				JSON.stringify({ error: { code: 'unauthorized', message: 'sign in required' } }),
				{ status: 401, headers: { 'content-type': 'application/json' } }
			);
		}
		const next = encodeURIComponent(path);
		return new Response(null, { status: 302, headers: { location: `/login?next=${next}` } });
	}

	return resolve(event);
};
