<script lang="ts">
	// Change the serverless demo's model from the web (PUT /api/v1/admin/settings/llm).
	// The server checks the model with the provider before saving; the API key
	// goes to the server once and comes back only as its last 4 characters.
	import { untrack } from 'svelte';
	import { PRESETS, presetById } from '#lib/llm-presets';

	type ModelCheck = { model: string; ok: boolean; reason?: string };
	export type LlmState = {
		llmPreset: string | null;
		llmModel: string | null;
		llmBaseUrl: string | null;
		fallbackModels?: string[];
		priceIn?: number | null;
		priceOut?: number | null;
		apiKeyLast4?: string | null;
		override: {
			preset: string;
			model: string;
			fallbackModels: string[];
			baseUrl: string | null;
			apiKeySource: 'web' | 'env' | 'none';
			apiKeyLast4: string | null;
			priceIn: number | null;
			priceOut: number | null;
			error?: string | null;
		} | null;
		envLlm: { provider: string; model: string; baseUrl: string | null } | null;
		editBlocker: string | null;
	};

	let {
		s,
		onsaved,
		oncancel
	}: { s: LlmState; onsaved: (msg: string) => void; oncancel: () => void } = $props();

	// Start from what's saved on the web, else from what is active now (env).
	// A snapshot on purpose: the form is re-created each time it opens.
	const init = untrack(() => s);
	const o = init.override;
	let preset = $state(o?.preset ?? init.llmPreset ?? 'gemini');
	let baseUrl = $state(o?.baseUrl ?? init.llmBaseUrl ?? '');
	let model = $state(o?.model ?? init.llmModel ?? '');
	let fallbacks = $state((o?.fallbackModels ?? init.fallbackModels ?? []).join(', '));
	let apiKey = $state('');
	let priceIn = $state<string | number>(o?.priceIn ?? '');
	let priceOut = $state<string | number>(o?.priceOut ?? '');
	let busy = $state(false);
	let msg = $state('');
	let checks = $state<ModelCheck[] | null>(null);

	let p = $derived(presetById(preset) ?? PRESETS[0]);
	let url = $derived(p.id === 'custom' ? baseUrl.trim().replace(/\/+$/, '') : p.baseUrl);

	/** Mirrors the server: which key is used when the field is left empty. */
	let keyHint = $derived.by(() => {
		if (
			o &&
			o.preset === p.id &&
			(o.baseUrl ?? null) === (url || null) &&
			o.apiKeySource !== 'none'
		)
			return `Kosongkan = pakai key tersimpan (••••${o.apiKeyLast4 ?? ''})`;
		const e = s.envLlm;
		if (e && e.provider === p.provider && (e.baseUrl ?? null) === (url || null))
			return 'Kosongkan = pakai LLM_API_KEY dari env';
		return p.keyRequired ? 'Wajib diisi' : 'Opsional';
	});

	function pickPreset(id: string) {
		preset = id;
		const next = presetById(id);
		model = next?.defaultModel ?? '';
		fallbacks = '';
		apiKey = '';
		priceIn = '';
		priceOut = '';
		checks = null;
		msg = '';
	}

	async function save() {
		busy = true;
		msg = '';
		checks = null;
		try {
			const res = await fetch('/api/v1/admin/settings/llm', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					preset,
					baseUrl,
					model,
					fallbackModels: fallbacks,
					apiKey,
					priceIn,
					priceOut
				})
			});
			const r = (await res.json().catch(() => null)) as {
				ok: boolean;
				error?: string;
				checks?: ModelCheck[];
			} | null;
			checks = r?.checks ?? null;
			if (!r?.ok) {
				msg = r?.error ?? `Gagal (HTTP ${res.status})`;
				return;
			}
			apiKey = '';
			const bad = (r.checks ?? []).filter((c) => !c.ok).length;
			onsaved(
				`Tersimpan: ${p.label} · ${model || p.defaultModel}` +
					(bad ? ` (${bad} cadangan gagal dicek)` : '') +
					' — aktif di semua server dalam ±30 detik'
			);
		} catch {
			msg = 'Server tidak terjangkau';
		} finally {
			busy = false;
		}
	}

	async function reset() {
		if (!confirm('Hapus pengaturan dari web dan kembali ke env Vercel?')) return;
		busy = true;
		msg = '';
		const res = await fetch('/api/v1/admin/settings/llm', { method: 'DELETE' }).catch(() => null);
		busy = false;
		if (res?.ok) onsaved('Kembali ke pengaturan env');
		else msg = 'Gagal reset — Redis tidak terjangkau';
	}
</script>

<div class="llmf">
	{#if s.editBlocker}
		<div class="row"><small class="warn">{s.editBlocker}</small></div>
	{:else}
		<div class="row">
			<div><label for="llm-p">Provider</label></div>
			<select id="llm-p" value={preset} onchange={(e) => pickPreset(e.currentTarget.value)}>
				{#each PRESETS as x (x.id)}<option value={x.id}>{x.label}</option>{/each}
			</select>
		</div>
		<div class="row">
			<div>
				<label for="llm-u">Base URL</label>
				<small>
					{p.id === 'custom'
						? 'Harus https://… (Vercel tidak bisa ke localhost)'
						: 'Otomatis dari provider'}
				</small>
			</div>
			{#if p.id === 'custom'}
				<input class="ti" id="llm-u" type="url" placeholder="https://…/v1" bind:value={baseUrl} />
			{:else}
				<code>{p.baseUrl ?? 'bawaan SDK'}</code>
			{/if}
		</div>
		<div class="row">
			<div>
				<label for="llm-m">Model</label><small>
					{p.defaultModel ? `Kosong = ${p.defaultModel}` : 'Wajib'}
				</small>
			</div>
			<input
				class="ti"
				id="llm-m"
				type="text"
				autocomplete="off"
				placeholder={p.modelHint}
				bind:value={model}
			/>
		</div>
		<div class="row">
			<div>
				<label for="llm-f">Model cadangan</label>
				<small>Pisahkan dengan koma, provider yang sama, maks. 5.</small>
			</div>
			<input
				class="ti"
				id="llm-f"
				type="text"
				autocomplete="off"
				placeholder="opsional"
				bind:value={fallbacks}
			/>
		</div>
		<div class="row">
			<div><label for="llm-k">API key</label><small>{keyHint}</small></div>
			<input
				class="ti"
				id="llm-k"
				type="password"
				autocomplete="off"
				placeholder="Tempel API key baru"
				bind:value={apiKey}
			/>
		</div>
		<div class="row">
			<div>
				<label for="llm-pi">Harga (USD / 1M token)</label>
				<small>Input · output. Untuk batas biaya harian; kosong = 0 (model gratis).</small>
			</div>
			<div class="acts">
				<input
					id="llm-pi"
					type="number"
					min="0"
					step="0.01"
					placeholder="input"
					aria-label="Harga input"
					bind:value={priceIn}
				/>
				<input
					type="number"
					min="0"
					step="0.01"
					placeholder="output"
					aria-label="Harga output"
					bind:value={priceOut}
				/>
			</div>
		</div>
		{#if checks}
			<ul class="checks">
				{#each checks as c (c.model)}
					<li>
						<span class={`badge ${c.ok ? 'ok' : 'er'}`}>{c.ok ? 'ok' : c.reason}</span>
						{c.model}
					</li>
				{/each}
			</ul>
		{/if}
		<div class="msg" role="alert">{msg}</div>
		<div class="row acts end">
			{#if o}<button class="b2" disabled={busy} onclick={reset}>Kembali ke env</button>{/if}
			<button class="b2" disabled={busy} onclick={oncancel}>Batal</button>
			<button class="b2 pri" disabled={busy} onclick={save}>
				{busy ? 'Mengecek…' : 'Tes & simpan'}
			</button>
		</div>
	{/if}
</div>

<style>
	.llmf {
		border-bottom: 1px solid var(--line);
		padding-left: 12px;
		border-left: 2px solid var(--acc);
	}
	.end {
		justify-content: flex-end;
	}
	.warn {
		color: var(--wn) !important;
	}
	.checks {
		list-style: none;
		margin: 8px 0 0;
		padding: 0;
		font-size: 13px;
		display: grid;
		gap: 4px;
	}
	button:disabled {
		opacity: 0.6;
		cursor: default;
	}
</style>
