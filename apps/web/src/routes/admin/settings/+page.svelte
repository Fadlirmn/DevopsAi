<script lang="ts">
	import type { PageProps } from './$types';

	type Health = { name: string; status: string };
	type Settings = {
		pipelineVersion: string;
		modelId: string;
		embedder: string;
		generator: string;
		retrievalTopK: number;
		healthChecks: Health[];
	};

	let { data }: PageProps = $props();
	let settings = $derived(data.settings as Settings | null);
</script>

<div class="eyebrow">Admin</div>
<h1>Settings</h1>
<p style="color: var(--fg-muted); margin: 8px 0 20px;">
	Running configuration and provider health.
</p>

<div class="callout" style="border-color: var(--warn); color: var(--warn);">
	<span>⚠</span>
	<span>
		No admin auth is enforced on this page yet (PRD.md §9 K-02 is still a stub) — don't expose this
		route publicly as-is.
	</span>
</div>

{#if !settings}
	<p style="color: var(--bad);">Could not load settings — is the RAG service running?</p>
{:else}
	<div class="card" style="margin-bottom: 20px;">
		<h2 style="font-size: 15px; margin-bottom: 12px;">Current config (read-only)</h2>
		<p style="font-size: 12.5px; color: var(--fg-muted); margin-bottom: 14px;">
			There's no settings table yet, so this reflects the service's actual running values — not an
			editable form that would silently fail to persist.
		</p>
		<div class="table-wrap">
			<table>
				<tbody>
					<tr><td>Pipeline version</td><td class="mono">{settings.pipelineVersion}</td></tr>
					<tr><td>Model ID</td><td class="mono">{settings.modelId}</td></tr>
					<tr><td>Embedder</td><td class="mono">{settings.embedder}</td></tr>
					<tr><td>Generator</td><td class="mono">{settings.generator}</td></tr>
					<tr><td>Retrieved chunks per answer</td><td class="mono">{settings.retrievalTopK}</td></tr>
				</tbody>
			</table>
		</div>
	</div>

	<div class="card" style="margin-bottom: 20px;">
		<h2 style="font-size: 15px; margin-bottom: 12px;">Not yet decided</h2>
		<ul style="margin: 0; padding-left: 18px; color: var(--fg-muted); font-size: 13px; line-height: 1.8;">
			<li>Public daily quota / burst limit — PRD.md §4 K-08</li>
			<li>Daily provider spend cap — PRD.md §4 K-08</li>
			<li>LLM provider/model pin — PRD.md §7</li>
			<li>Embedding provider/model pin — PRD.md §7</li>
		</ul>
	</div>

	<div class="card">
		<h2 style="font-size: 15px; margin-bottom: 12px;">Provider health</h2>
		{#each settings.healthChecks as h (h.name)}
			<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border);">
				<span>{h.name}</span>
				<span class={`badge ${h.status === 'connected' ? 'badge-good' : h.status === 'unreachable' ? 'badge-bad' : 'badge-neutral'}`}
					><span class="dot"></span>{h.status}</span
				>
			</div>
		{/each}
	</div>
{/if}
