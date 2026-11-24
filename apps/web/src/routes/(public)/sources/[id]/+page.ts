import { error } from '@sveltejs/kit';

export async function load({ fetch, params, url }) {
	const res = await fetch(`/api/v1/sources/${params.id}`);
	if (!res.ok) throw error(res.status, 'Source not found or not public.');
	const source = await res.json();
	return { source, highlightChunk: url.searchParams.get('chunk') ?? '' };
}
