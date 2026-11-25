<script lang="ts">
	// Display copied from docs/mockups/admin.html "Dokumen"; rows are real
	// (/api/v1/admin/documents). Upload and the publish toggle need the ingestion
	// worker + write endpoints (not built yet); they say so instead of faking it.
	import { say } from '#lib/ui.svelte';
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
		updatedAt: string;
	};

	let { data }: PageProps = $props();
	let documents = $derived(data.documents as Doc[]);

	function ingestion(s: string | null): { cls: string; text: string } {
		if (s === 'ready') return { cls: 'ok', text: 'succeeded' };
		if (s === 'failed') return { cls: 'er', text: 'failed' };
		if (s === 'pending' || s === 'processing') return { cls: 'wn', text: 'running' };
		return { cls: 'wn', text: 'belum ada versi' };
	}

	function when(iso: string): string {
		const t = new Date(iso).getTime();
		const start = new Date(new Date().toDateString()).getTime();
		if (t >= start) return 'Hari ini';
		if (t >= start - 86_400_000) return 'Kemarin';
		return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
	}
</script>

<section class="pg" id="p-dokumen">
	<h1>Dokumen</h1>
	<p class="sub">Upload, versi, status ingestion, dan visibilitas.</p>
	<button
		class="drop"
		id="drop"
		onclick={() => say('Upload belum tersedia — worker ingestion belum dibangun')}
	>
		<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg><b
			style="color:var(--text)"
		>
			Seret file ke sini atau klik
		</b><span>PDF, MD, TXT · maks 20 MB</span>
	</button>
	<h2>Daftar dokumen</h2>
	<div class="tw">
		<table>
			<thead>
				<tr><th>Nama</th><th>Versi</th><th>Ingestion</th><th>Publik</th><th>Diperbarui</th></tr>
			</thead>
			<tbody>
				{#each documents as d (d.id)}
					{@const ing = ingestion(d.versionStatus)}
					<tr>
						<td>{d.title}</td>
						<td class="n">{d.versionNumber ? `v${d.versionNumber}` : '—'}</td>
						<td><span class={`badge ${ing.cls}`}>{ing.text}</span></td>
						<td>
							<button
								class="sw"
								role="switch"
								aria-checked={d.visibility === 'public' && d.docStatus === 'published'}
								aria-label={`Publik ${d.title}`}
								onclick={() => say('Ubah visibilitas belum tersedia')}
							></button>
						</td>
						<td>{when(d.updatedAt)}</td>
					</tr>
				{:else}
					<tr><td colspan="5" class="empty">Belum ada dokumen.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
	<h2>Timeline ingestion</h2>
	<ul class="tl"><li class="run">Belum ada job ingestion — worker belum aktif.</li></ul>
</section>
