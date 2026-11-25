<script lang="ts">
	// Display copied from docs/mockups/admin.html "Evaluasi"; data is real
	// (/api/v1/admin/evaluations + coverage-gaps). No eval runner exists yet,
	// so the metric cards show "—" until a real run writes numbers.
	import type { PageProps } from './$types';

	type Run = {
		id: string;
		datasetVersion: string;
		metrics: Record<string, number> | null;
		status: string;
		createdAt: string;
	};
	type Gap = { question: string; timesAsked: number; firstSeen: string };

	let { data }: PageProps = $props();
	let runs = $derived(data.runs as Run[]);
	let gaps = $derived(data.coverageGaps as Gap[]);
	let latest = $derived(runs.find((r) => r.status === 'succeeded' && r.metrics)?.metrics ?? null);

	const fixed2 = (v: number) => v.toFixed(2);
	function metric(key: string, fmt: (v: number) => string = fixed2): string {
		const v = latest?.[key];
		return typeof v === 'number' ? fmt(v) : '—';
	}
	function cell(r: Run, key: string, fmt: (v: number) => string = fixed2): string {
		const v = r.metrics?.[key];
		return typeof v === 'number' ? fmt(v) : '—';
	}
	const badge = (s: string) => (s === 'succeeded' ? 'ok' : s === 'failed' ? 'er' : 'wn');
	const secs = (v: number) => `${v.toFixed(1)} s`;
</script>

<section class="pg" id="p-evaluasi">
	<h1>Evaluasi</h1>
	<p class="sub">Kualitas retrieval dan jawaban per run.</p>
	<div class="grid">
		<div class="card"><small>Recall@5</small><strong>{metric('recall_at_5')}</strong></div>
		<div class="card"><small>MRR</small><strong>{metric('mrr')}</strong></div>
		<div class="card">
			<small>Grounding</small><strong>
				{metric('grounding', (v) => `${Math.round(v * 100)}%`)}
			</strong>
		</div>
		<div class="card">
			<small>Latency p50</small><strong>{metric('latency_p50_s', secs)}</strong>
		</div>
		<div class="card">
			<small>Biaya / 100 q</small><strong>
				{metric('cost_per_100_usd', (v) => `$${v.toFixed(2)}`)}
			</strong>
		</div>
	</div>
	<h2>Run</h2>
	<div class="tw">
		<table>
			<thead>
				<tr>
					<th>Run</th><th>Config</th><th>Status</th><th>Recall@5</th><th>MRR</th><th>Latency</th>
				</tr>
			</thead>
			<tbody>
				{#each runs as r, i (r.id)}
					<tr>
						<td>#{runs.length - i}</td>
						<td>{r.datasetVersion}</td>
						<td><span class={`badge ${badge(r.status)}`}>{r.status}</span></td>
						<td class="n">{cell(r, 'recall_at_5')}</td>
						<td class="n">{cell(r, 'mrr')}</td>
						<td class="n">{cell(r, 'latency_p50_s', secs)}</td>
					</tr>
				{:else}
					<tr>
						<td colspan="6" class="empty">Belum ada run evaluasi — runner belum dibangun.</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<h2>Coverage gap (di-abstain, urut frekuensi)</h2>
	<div class="tw">
		<table>
			<thead><tr><th>Query</th><th>Jumlah</th></tr></thead>
			<tbody>
				{#each gaps as g (g.question)}
					<tr><td>{g.question}</td><td class="n">{g.timesAsked}</td></tr>
				{:else}
					<tr><td colspan="2" class="empty">Belum ada pertanyaan yang di-abstain.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>
