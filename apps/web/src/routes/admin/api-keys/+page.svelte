<script lang="ts">
	// Display copied from docs/mockups/admin.html "API & Kunci". Provider rows
	// show real status. Keys, public API keys and CORS have no backend yet:
	// the buttons say so instead of pretending to save.
	import { refreshAll } from '$app/navigation';
	import { say } from '#lib/ui.svelte';
	import type { PageProps } from './$types';

	type Health = { name: string; status: string };
	type ModelCheck = { model: string; ok: boolean; reason?: string };
	type Settings = {
		/** Set by the serverless demo (Vercel without a VPS); absent from the VPS. */
		mode?: 'serverless';
		modelId: string;
		llmProvider: string;
		llmModel: string;
		fallbackModels?: string[];
		embeddingProvider: string;
		embeddingModel: string;
		staleEmbeddingVersions: number;
		redis?: { status: string; host: string | null };
		modelChecks?: ModelCheck[] | null;
		healthChecks: Health[];
	};
	const health = (name: string) => settings?.healthChecks.find((h) => h.name === name)?.status;

	// Key material never leaves the server: we only show which provider/model is active.
	function providerRow(provider: string | undefined, model: string | undefined) {
		if (!settings)
			return { small: 'Server AI tidak terjangkau', badge: { cls: 'er', text: 'error' } };
		if (provider === 'mock')
			return { small: 'mock · tanpa API key', badge: { cls: 'wn', text: 'mock' } };
		return { small: `${provider} · ${model}`, badge: { cls: 'ok', text: 'aktif' } };
	}

	function llmRow() {
		const llm = health('LLM provider') ?? '';
		if (settings?.mode === 'serverless' && llm.startsWith('error'))
			return { small: llm.slice('error: '.length), badge: { cls: 'er', text: 'error' } };
		const row = providerRow(settings?.llmProvider, settings?.llmModel);
		const fb = settings?.fallbackModels ?? [];
		return fb.length ? { ...row, small: `${row.small} · cadangan: ${fb.join(', ')}` } : row;
	}

	function redisRow() {
		const r = settings?.redis;
		if (r?.status === 'connected')
			return {
				small: `${r.host} · rate limit, cache, batas biaya`,
				badge: { cls: 'ok', text: 'ok' }
			};
		if (r?.status === 'not configured')
			return {
				small: 'KV_REST_API_URL / KV_REST_API_TOKEN kosong · limit per instance saja',
				badge: { cls: 'wn', text: 'belum diatur' }
			};
		return {
			small: `${r?.host ?? '?'} · tidak terjangkau atau token salah`,
			badge: { cls: 'er', text: 'error' }
		};
	}

	let { data }: PageProps = $props();
	let settings = $derived(data.settings as Settings | null);
	let serverless = $derived(settings?.mode === 'serverless');
	let pg = $derived(health('Postgres') ?? 'unreachable');

	let rows = $derived([
		{ n: 'Model API', label: 'Model API', ...llmRow() },
		serverless
			? {
					n: 'Embedding',
					label: 'Retrieval',
					small: `BM25 · ${settings?.embeddingModel} · tanpa embedding`,
					badge: { cls: 'ok', text: 'ok' }
				}
			: {
					n: 'Embedding',
					label: 'Embedding',
					...providerRow(settings?.embeddingProvider, settings?.embeddingModel),
					...(settings?.staleEmbeddingVersions
						? {
								badge: {
									cls: 'er',
									text: `${settings.staleEmbeddingVersions} dok perlu embed ulang`
								}
							}
						: {})
				},
		serverless
			? { n: 'Redis', label: 'Redis (Upstash)', ...redisRow() }
			: {
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
		if (n === 'Model API' && serverless) {
			// Asks the provider whether the key sees each model (free, no tokens).
			say('Model API: mengecek…');
			const res = await fetch('/api/v1/admin/settings?test=1').catch(() => null);
			const s = res?.ok ? ((await res.json()) as Settings) : null;
			const checks = s?.modelChecks;
			if (!checks)
				return say(`Model API: ${s ? (health('LLM provider') ?? 'error') : 'gagal'}`, 4000);
			say(
				checks.map((c) => `${c.model}: ${c.ok ? 'ok' : c.reason}`).join(' · '),
				checks.every((c) => c.ok) ? 3000 : 6000
			);
			return;
		}
		await refreshAll();
		const r = rows.find((x) => x.n === n);
		say(`${r?.label ?? n}: ${r?.badge.text ?? '?'}`);
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
		say(
			serverless
				? 'Ganti di Vercel → Settings → Environment Variables (LLM_* / KV_REST_API_*) lalu redeploy'
				: 'Ganti lewat infra/.env (LLM_* / EMBEDDING_*) lalu restart — lihat README',
			4000
		);
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
