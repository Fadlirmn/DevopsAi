// hooks.server.ts verifies the admin cookie on every request; this only tells
// the shells whether to render admin entry points. Not an access check:
// /admin/* and /api/v1/admin/* are still gated in hooks.server.ts.
export function load({ locals }) {
	return {
		isAdmin: locals.adminUid !== null,
		adminEmail: locals.adminEmail,
		adminName: locals.adminName
	};
}
