// Real provider status for the "API & Kunci" page: RAG runtime config + DB
// health, and whether Firebase admin auth is configured on this server.
// Never sends key material to the browser.
export async function load({ fetch }) {
	const res = await fetch('/api/v1/admin/settings');
	return {
		settings: res.ok ? ((await res.json()) as Record<string, unknown>) : null,
		firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? ''
	};
}
