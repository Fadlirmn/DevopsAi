export async function load({ fetch }) {
	const res = await fetch('/api/v1/admin/settings');
	return { settings: res.ok ? await res.json() : null };
}
