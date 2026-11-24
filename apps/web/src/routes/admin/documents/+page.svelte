<script lang="ts">
	import type { PageProps } from './$types';

	type Doc = {
		id: string;
		title: string;
		docStatus: string;
		collectionTitle: string;
		visibility: string;
		versionNumber: number | null;
		versionStatus: string | null;
		errorCode: string | null;
	};

	let { data }: PageProps = $props();
	let documents = $derived(data.documents as Doc[]);
	let dragging = $state(false);
	let toast = $state('');

	function badgeClass(status: string | null) {
		if (status === 'published' || status === 'ready') return 'badge-good';
		if (status === 'failed' || status === 'dead') return 'badge-bad';
		if (status === 'processing' || status === 'pending' || status === 'queued' || status === 'running')
			return 'badge-warn';
		return 'badge-neutral';
	}

	function notWired() {
		toast = 'Upload/ingestion isn\'t wired up yet — the worker is still a stub (see docs/IMPLEMENTATION.md, milestone M1).';
		setTimeout(() => (toast = ''), 3500);
	}
</script>

<div class="eyebrow">Admin</div>
<h1>Documents</h1>
<p style="color: var(--fg-muted); margin: 8px 0 20px;">
	Upload, ingestion status, and publish/archive controls.
</p>

<div class="callout" style="border-color: var(--warn); color: var(--warn);">
	<span>⚠</span>
	<span>
		No admin auth is enforced on this page yet (Firebase ID-token verification, PRD.md §9 K-02,
		is still a stub) — don't expose this route publicly as-is.
	</span>
</div>

<div
	class="dropzone"
	class:drag={dragging}
	role="button"
	tabindex="0"
	ondragover={(e) => {
		e.preventDefault();
		dragging = true;
	}}
	ondragleave={() => (dragging = false)}
	ondrop={(e) => {
		e.preventDefault();
		dragging = false;
		notWired();
	}}
	onclick={notWired}
	onkeydown={(e) => e.key === 'Enter' && notWired()}
>
	<strong>Drop a PDF, Markdown or TXT file here</strong><br />to start ingestion, or click to browse.
</div>

{#if toast}
	<p style="font-size: 12.5px; color: var(--fg-muted); margin-bottom: 16px;">{toast}</p>
{/if}

{#if documents.length === 0}
	<p style="color: var(--fg-muted);">No documents yet.</p>
{:else}
	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>Document</th>
					<th>Collection</th>
					<th>Visibility</th>
					<th>Version</th>
					<th>Status</th>
				</tr>
			</thead>
			<tbody>
				{#each documents as doc (doc.id)}
					<tr>
						<td>{doc.title}</td>
						<td>{doc.collectionTitle}</td>
						<td>
							<span class={`badge ${doc.visibility === 'public' ? 'badge-neutral' : 'badge-warn'}`}
								><span class="dot"></span>{doc.visibility}</span
							>
						</td>
						<td class="mono">{doc.versionNumber ?? '—'}</td>
						<td>
							<span class={`badge ${badgeClass(doc.docStatus)}`}
								><span class="dot"></span>{doc.docStatus}</span
							>
							{#if doc.versionStatus && doc.versionStatus !== doc.docStatus}
								<span class={`badge ${badgeClass(doc.versionStatus)}`} style="margin-left: 4px;"
									><span class="dot"></span>{doc.versionStatus}</span
								>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<div style="display: flex; gap: 8px; margin-top: 16px;">
	<button class="btn" disabled title="Not implemented yet — see docs/IMPLEMENTATION.md M1">
		Publish
	</button>
	<button class="btn" disabled title="Not implemented yet — see docs/IMPLEMENTATION.md M1">
		Archive
	</button>
	<button class="btn" disabled title="Not implemented yet — see docs/IMPLEMENTATION.md M1">
		Retry job
	</button>
</div>
