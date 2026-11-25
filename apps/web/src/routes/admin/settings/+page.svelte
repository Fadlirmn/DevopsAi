<script lang="ts">
	// Display copied from docs/mockups/admin.html "Pengaturan". Values are the
	// service's real running config. There's no settings table yet, so "Simpan"
	// validates like the mockup and then says it can't persist, instead of
	// pretending it saved. The theme does apply (client-side).
	import { say } from '#lib/ui.svelte';
	import ThemeSwitch from '#lib/ThemeSwitch.svelte';
	import type { PageProps } from './$types';

	type Health = { name: string; status: string };
	type Settings = {
		pipelineVersion: string;
		modelId: string;
		retrievalTopK: number;
		similarityThreshold?: number;
		healthChecks: Health[];
	};

	let { data }: PageProps = $props();
	let settings = $derived(data.settings as Settings | null);

	let quota = $state<number | string>('');
	let topk = $state<number | string>(
		String((data.settings as Settings | null)?.retrievalTopK ?? '')
	);
	let thr = $state<number | string>(
		String((data.settings as Settings | null)?.similarityThreshold ?? '')
	);
	let msg = $state('');
	let bad = $state<Record<string, boolean>>({});

	const FIELDS: [string, number, number, string, () => unknown][] = [
		['quota', 1, 10000, 'Kuota', () => quota],
		['topk', 1, 20, 'Top-K', () => topk],
		['thr', 0, 1, 'Ambang', () => thr]
	];

	function save() {
		msg = '';
		const next: Record<string, boolean> = {};
		for (const [id, lo, hi, label, get] of FIELDS) {
			const v = parseFloat(String(get()));
			const ok = !isNaN(v) && v >= lo && v <= hi;
			next[id] = !ok;
			if (!ok && !msg) {
				msg = `${label} harus antara ${lo} dan ${hi}.`;
				document.getElementById(id)?.focus();
			}
		}
		bad = next;
		if (!msg) say('Belum bisa disimpan — belum ada tabel settings', 3000);
	}

	function health(h: Health): { cls: string; text: string } {
		if (h.status === 'connected') return { cls: 'ok', text: 'ok' };
		if (h.status === 'unreachable') return { cls: 'er', text: 'error' };
		return { cls: 'wn', text: 'mock' };
	}
</script>

<section class="pg" id="p-pengaturan">
	<h1>Pengaturan</h1>
	<p class="sub">Kuota, model, retrieval, tampilan.</p>
	<div class="form" id="form">
		<div class="row">
			<div><label for="quota">Kuota (request / menit)</label><small>1 sampai 10.000</small></div>
			<input
				type="number"
				id="quota"
				min="1"
				max="10000"
				placeholder="belum diatur"
				aria-invalid={bad.quota}
				bind:value={quota}
			/>
		</div>
		<div class="row">
			<div><label for="model">Versi model</label></div>
			<select id="model">
				<option>{settings?.modelId ?? '—'}</option>
			</select>
		</div>
		<div class="row">
			<div><label for="topk">Top-K retrieval</label><small>1 sampai 20</small></div>
			<input type="number" id="topk" min="1" max="20" aria-invalid={bad.topk} bind:value={topk} />
		</div>
		<div class="row">
			<div>
				<label for="thr">Ambang kemiripan</label><small>
					0 sampai 1. Di bawah ini, jawaban di-abstain.
				</small>
			</div>
			<input
				type="number"
				id="thr"
				min="0"
				max="1"
				step="0.05"
				aria-invalid={bad.thr}
				bind:value={thr}
			/>
		</div>
		<div class="row">
			<div><label for="tsw">Tema</label></div>
			<ThemeSwitch />
		</div>
	</div>
	<div class="msg" id="msg" role="alert">{msg}</div>
	<button class="btn" id="save" onclick={save}>Simpan</button>
	<h2>Kesehatan provider</h2>
	<div class="form">
		{#if settings}
			{#each settings.healthChecks as h (h.name)}
				{@const s = health(h)}
				<div class="row"><span>{h.name}</span><span class={`badge ${s.cls}`}>{s.text}</span></div>
			{/each}
		{:else}
			<div class="row"><span>RAG service</span><span class="badge er">tidak terjangkau</span></div>
		{/if}
	</div>
</section>
