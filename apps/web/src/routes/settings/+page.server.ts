// Data for /settings. Admin-only facts (UID, session expiry, Firebase project)
// come from the token hooks.server.ts already verified on this request; a
// visitor gets none of them.
export async function load({ locals, fetch }) {
	const res = await fetch('/api/v1/collections');
	const collections = res.ok ? ((await res.json()) as { slug: string; title: string }[]) : [];
	const isAdmin = locals.adminUid !== null;
	return {
		collections,
		account: isAdmin
			? {
					uid: locals.adminUid,
					sessionExp: locals.adminSessionExp,
					firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? ''
				}
			: null
	};
}
