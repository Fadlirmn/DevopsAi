export async function load({ fetch }) {
	const res = await fetch('/api/v1/collections');
	const collections = res.ok ? await res.json() : [];
	return { collections };
}
