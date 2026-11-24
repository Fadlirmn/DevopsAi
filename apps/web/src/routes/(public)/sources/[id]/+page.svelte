<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';

	type Chunk = {
		chunkId: string;
		ordinal: number;
		page: number | null;
		heading: string | null;
		content: string;
	};
	type Source = {
		documentId: string;
		title: string;
		collectionTitle: string;
		collectionSlug: string;
		versionNumber: number;
		chunks: Chunk[];
	};

	let { data }: PageProps = $props();
	let source = $derived(data.source as Source);
	let highlightChunk = $derived(data.highlightChunk as string);

	onMount(() => {
		if (!highlightChunk) return;
		document.getElementById(`chunk-${highlightChunk}`)?.scrollIntoView({ block: 'center' });
	});
</script>

<div class="eyebrow">Public</div>
<h1>{source.title}</h1>
<div style="display: flex; gap: 16px; color: var(--fg-muted); font-size: 12.5px; margin: 8px 0 20px;">
	<span>Collection: {source.collectionTitle}</span>
	<span class="mono">v{source.versionNumber}</span>
</div>

{#each source.chunks as chunk (chunk.chunkId)}
	<div
		class="source-card"
		class:flash={highlightChunk === chunk.chunkId}
		id={`chunk-${chunk.chunkId}`}
	>
		<div class="source-card-head">
			<span class="source-card-num">#{chunk.ordinal}</span>
			<span class="source-card-title">{chunk.heading ?? 'Untitled section'}</span>
		</div>
		<div class="source-card-meta">{chunk.page ? `Page ${chunk.page}` : ''}</div>
		<p style="font-size: 13px; margin: 0;">{chunk.content}</p>
	</div>
{/each}
