<script lang="ts">
	// Not drawn in the mockups; built from chat.html's own shell (top bar,
	// .col column) and source cards (.srcs/.s) so it reads as the same app.
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
		if (highlightChunk)
			document.getElementById(`chunk-${highlightChunk}`)?.scrollIntoView({ block: 'center' });
	});
</script>

<svelte:head><title>{source.title} — KnowledgeOps AI</title></svelte:head>

<div class="chat-app">
	<div class="main">
		<header class="top">
			<a class="back" href="/">← Kembali ke chat</a>
			<span class="sp"></span>
			<span class="t">KnowledgeOps AI</span>
		</header>
		<div class="scroll">
			<div class="col doc">
				<div>
					<h1>{source.title}</h1>
					<p class="sub">{source.collectionTitle} · v{source.versionNumber}</p>
					<div class="srcs">
						{#each source.chunks as chunk (chunk.chunkId)}
							<div
								class="s"
								class:on={highlightChunk === chunk.chunkId}
								id={`chunk-${chunk.chunkId}`}
							>
								<b>{chunk.heading ?? `Bagian ${chunk.ordinal}`}</b><small>
									#{chunk.ordinal}{chunk.page ? ` · hal. ${chunk.page}` : ''}
								</small>
								<div>{chunk.content}</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
