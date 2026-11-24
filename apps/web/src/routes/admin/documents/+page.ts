export async function load({ fetch }) {
	const res = await fetch('/api/v1/admin/documents');
	const documents = res.ok ? await res.json() : [];
	return { documents };
}
