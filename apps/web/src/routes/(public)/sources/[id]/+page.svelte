<script lang="ts">
	import Logo from '#lib/Logo.svelte';
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
		sourceUrl: string | null;
		license: string | null;
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
			<span class="t"><Logo size={22} />KnowledgeOps AI</span>
		</header>
		<div class="scroll">
			<div class="col doc">
				<div>
					<h1>{source.title}</h1>
					<p class="sub">{source.collectionTitle} · v{source.versionNumber}</p>
					{#if source.sourceUrl || source.license}
						<!-- Attribution: required for CC BY sources (Kubernetes docs). -->
						<p class="sub attr">
							{#if source.sourceUrl}Sumber asli: <a
									href={source.sourceUrl}
									rel="noopener"
									target="_blank"
								>
									{new URL(source.sourceUrl).hostname}
								</a>{/if}{#if source.sourceUrl && source.license}
								·
							{/if}{#if source.license}Lisensi: {source.license}{/if}
						</p>
					{/if}
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
