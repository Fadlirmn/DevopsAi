<script lang="ts">
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
		usage: { inputTokens: number; outputTokens: number };
	};

	let collectionSlug = 'incident-playbooks';
	let message = $state('How do I roll back a failed Kubernetes deployment?');
	let loading = $state(false);
	let result = $state<ChatResult | null>(null);
	let errorMsg = $state('');

	async function ask() {
		loading = true;
		errorMsg = '';
		result = null;
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
				errorMsg = data?.detail ?? `request failed (${res.status})`;
			} else {
				result = data;
			}
		} catch {
			errorMsg = 'Could not reach the RAG service.';
		} finally {
			loading = false;
		}
	}
</script>

<h1>Demo</h1>
<p>Collection: <code>{collectionSlug}</code> (seeded dev data — see <code>services/rag/scripts/seed_dev.py</code>)</p>

<form
	onsubmit={(e) => {
		e.preventDefault();
		ask();
	}}
>
	<textarea bind:value={message} rows="2" style="width: 100%; max-width: 480px;"></textarea>
	<br />
	<button type="submit" disabled={loading}>{loading ? 'Asking…' : 'Ask'}</button>
</form>

{#if errorMsg}
	<p style="color: #b8392f;">{errorMsg}</p>
{/if}

{#if result}
	<p><strong>Answer</strong> {result.grounded ? '' : '(abstained)'} {result.cacheHit ? '· from cache' : ''}</p>
	<p>{result.answer}</p>

	{#if result.citations.length > 0}
		<h2>Sources</h2>
		<ul>
			{#each result.citations as c (c.chunkId)}
				<li>
					<strong>[{c.marker}] {c.title}</strong>{#if c.page}, p.{c.page}{/if}
					<br />
					<em>{c.excerpt}</em>
				</li>
			{/each}
		</ul>
	{/if}
{/if}
