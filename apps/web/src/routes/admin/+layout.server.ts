// hooks.server.ts already rejects unauthenticated requests before this runs;
// this just hands the verified identity down to the admin pages/layout.
export function load({ locals }) {
	return { adminUid: locals.adminUid, adminEmail: locals.adminEmail };
}
