<script lang="ts">
	import type { PageProps } from './$types';

	type Citation = {
		marker: number;
		chunkId: string;
		documentId: string;
		title: string;
		page: number | null;
		excerpt: string;
	};
	type ChatResult = {
		answer: string;
		citations: Citation[];
		grounded: boolean;
		cacheHit: boolean;
	};
	type Collection = { slug: string; title: string; description: string };

	let { data }: PageProps = $props();
	let collections = $derived(data.collections as Collection[]);
	let collectionSlug = $state((data.collections as Collection[])[0]?.slug ?? '');
	let message = $state('How do I roll back a failed Kubernetes deployment?');
	let lastAsked = $state('');
	let loading = $state(false);
	let result = $state<ChatResult | null>(null);
	let errorMsg = $state('');
	let flashedCardId = $state('');

	async function ask() {
		if (!message.trim() || !collectionSlug) return;
		loading = true;
		errorMsg = '';
		result = null;
		lastAsked = message;
		try {
			const res = await fetch('/api/v1/chat', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					collectionSlug,
					message,
					history: [],
					clientRequestId: crypto.randomUUID()
				})
			});
			const data = await res.json();
			if (!res.ok) {
				errorMsg = data?.detail ?? `Request failed (${res.status}).`;
			} else {
				result = data;
			}
		} catch {
			errorMsg = 'Could not reach the demo backend.';
		} finally {
			loading = false;
		}
	}

	function retry() {
		message = lastAsked;
		ask();
	}

	function clearSession() {
		result = null;
		errorMsg = '';
		lastAsked = '';
	}

	function focusSource(chunkId: string) {
		flashedCardId = chunkId;
		const el = document.getElementById(`source-${chunkId}`);
		el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		setTimeout(() => {
			if (flashedCardId === chunkId) flashedCardId = '';
		}, 1200);
	}
</script>

<div class="eyebrow">Public</div>
<h1>Demo</h1>
<p style="color: var(--fg-muted); margin: 8px 0 20px;">
	Ask a question about a public collection. Every answer links back to the exact passage it came
	from — see the sources on the right.
</p>

{#if collections.length > 0}
	<div class="chip-row" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:20px;">
		{#each collections as c (c.slug)}
			<button
				class="chip"
				aria-pressed={collectionSlug === c.slug}
				onclick={() => (collectionSlug = c.slug)}
			>
				{c.title}
			</button>
		{/each}
	</div>
{/if}

<div class="callout">
	<span>⚠</span>
	<span
		>Answers are generated from retrieved passages and may be wrong — verify against the linked
		source. This demo uses a deterministic mock model, not a live LLM (see <code>docs/PRD.md</code
		> §15).</span
	>
</div>

<form
	onsubmit={(e) => {
		e.preventDefault();
		ask();
	}}
	style="margin-bottom: 20px;"
>
	<textarea
		bind:value={message}
		rows="2"
		style="width: 100%; max-width: 480px; display: block; margin-bottom: 8px;"
		aria-label="Your question"
	></textarea>
	<button class="btn btn-primary" type="submit" disabled={loading || !collectionSlug}>
		{loading ? 'Asking…' : 'Ask'}
	</button>
</form>

{#if errorMsg}
	<div class="callout" role="alert" style="border-color: var(--bad); color: var(--bad);">
		{errorMsg}
	</div>
{/if}

<div style="display: grid; gap: 24px; grid-template-columns: 1.2fr 1fr;" class="demo-grid">
	<div aria-live="polite">
		{#if result}
			<div class="chat">
				<div class="msg msg-user">{lastAsked}</div>
				<div class="msg msg-assistant">
					{result.answer}
					{#if result.citations.length > 0}
						{#each result.citations as c (c.chunkId)}
							<button
								class="cite"
								type="button"
								onclick={() => focusSource(c.chunkId)}
								aria-label={`Jump to source ${c.marker}`}
							>
								{c.marker}
							</button>
						{/each}
					{/if}
				</div>
			</div>
			<p style="font-size: 12px; color: var(--fg-muted);">
				{result.grounded ? 'Grounded' : 'Abstained'} · {result.cacheHit ? 'from cache' : 'fresh'}
			</p>
			<div style="display: flex; gap: 8px; margin-top: 10px;">
				<button class="btn" type="button" onclick={retry}>Retry</button>
				<button class="btn" type="button" onclick={clearSession}>Clear session</button>
			</div>
		{/if}
	</div>

	<div>
		{#if result && result.citations.length > 0}
			<h2 style="font-size: 15px; margin-bottom: 10px;">Sources</h2>
			{#each result.citations as c (c.chunkId)}
				<div class="source-card" id={`source-${c.chunkId}`} class:flash={flashedCardId === c.chunkId}>
					<div class="source-card-head">
						<span class="source-card-num">[{c.marker}]</span>
						<span class="source-card-title">{c.title}</span>
					</div>
					<div class="source-card-meta">{c.page ? `Page ${c.page}` : ''}</div>
					<div class="source-card-excerpt">{c.excerpt}</div>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	@media (max-width: 640px) {
		.demo-grid {
			grid-template-columns: 1fr !important;
		}
	}
</style>
