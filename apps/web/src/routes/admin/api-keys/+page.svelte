<script lang="ts">
	// Display copied from docs/mockups/admin.html "API & Kunci". Provider rows
	// show real status. Keys, public API keys and CORS have no backend yet:
	// the buttons say so instead of pretending to save.
	import { refreshAll } from '$app/navigation';
	import { say } from '#lib/ui.svelte';
	import type { PageProps } from './$types';

	type Health = { name: string; status: string };
	type Settings = { modelId: string; embedder: string; generator: string; healthChecks: Health[] };

	let { data }: PageProps = $props();
	let settings = $derived(data.settings as Settings | null);
	let pg = $derived(
		settings?.healthChecks.find((h) => h.name === 'Postgres')?.status ?? 'unreachable'
	);

	let rows = $derived([
		{
			n: 'Model API',
			label: 'Model API',
			small: settings ? `${settings.modelId} · belum ada kunci` : 'RAG service tidak terjangkau',
			badge: settings ? { cls: 'wn', text: 'mock' } : { cls: 'er', text: 'error' }
		},
		{
			n: 'Embedding',
			label: 'Embedding',
			small: settings ? `${settings.embedder} · belum ada kunci` : 'RAG service tidak terjangkau',
			badge: settings ? { cls: 'wn', text: 'mock' } : { cls: 'er', text: 'error' }
		},
		{
			n: 'Database vektor',
			label: 'URL database vektor',
			small: 'db:5432 · jaringan internal',
			badge: pg === 'connected' ? { cls: 'ok', text: 'ok' } : { cls: 'er', text: 'error' }
		},
		{
			n: 'Firebase',
			label: 'Firebase Auth',
			small: data.firebaseProjectId || 'belum diatur',
			badge: data.firebaseProjectId
				? { cls: 'ok', text: 'ok' }
				: { cls: 'er', text: 'belum diatur' }
		}
	]);

	let editing = $state<string | null>(null);
	let newValue = $state('');
	let invalid = $state(false);

	async function test(n: string) {
		await refreshAll();
		const r = rows.find((x) => x.n === n);
		say(`${n}: ${r?.badge.text ?? '?'}`);
	}

	function toggleChange(n: string) {
		editing = editing === n ? null : n;
		newValue = '';
		invalid = false;
	}

	function saveChange() {
		if (newValue.trim().length < 8) {
			invalid = true;
			say('Terlalu pendek (min 8)');
			return;
		}
		editing = null;
		say('Belum bisa disimpan dari UI — ubah infra/.env lalu restart', 3000);
	}
</script>

<section class="pg" id="p-apikey">
	<h1>API &amp; Kunci</h1>
	<p class="sub">Kunci provider disimpan di server. Browser hanya lihat 4 karakter terakhir.</p>
	<h2>Provider</h2>
	<div class="form" id="prov">
		{#each rows as r (r.n)}
			<div class="row" data-n={r.n}>
				<div><label for={`v-${r.n}`}>{r.label}</label><small>{r.small}</small></div>
				<div class="acts">
					<span class={`badge ${r.badge.cls}`}>{r.badge.text}</span><button
						class="b2"
						onclick={() => test(r.n)}
					>
						Tes
					</button><button class="b2" onclick={() => toggleChange(r.n)}>Ganti</button>
				</div>
			</div>
			{#if editing === r.n}
				<div class="row chg">
					<!-- svelte-ignore a11y_autofocus -->
					<input
						class="ti"
						id={`v-${r.n}`}
						type="password"
						autocomplete="off"
						placeholder="Tempel nilai baru"
						aria-label="Nilai baru"
						aria-invalid={invalid}
						autofocus
						bind:value={newValue}
					/><button class="b2 pri" onclick={saveChange}>Simpan</button>
				</div>
			{/if}
		{/each}
	</div>
	<h2>Kunci API publik</h2>
	<div class="tw">
		<table>
			<thead>
				<tr><th>Nama</th><th>Kunci</th><th>Dibuat</th><th>Terakhir dipakai</th><th></th></tr>
			</thead>
			<tbody id="keys">
				<tr><td colspan="5" class="empty">Belum ada kunci API publik.</td></tr>
			</tbody>
		</table>
	</div>
	<button class="btn" id="mk" onclick={() => say('Kunci API publik belum tersedia')}>
		Buat kunci
	</button>
	<h2>Origin yang diizinkan (CORS)</h2>
	<div class="form">
		<div class="row">
			<div><label for="org">Domain</label><small>Pisahkan dengan koma.</small></div>
			<input class="ti" type="text" id="org" placeholder="https://domain-kamu.com" />
		</div>
	</div>
	<button class="btn" id="so" onclick={() => say('Pengaturan CORS belum tersedia')}>Simpan</button>
</section>
