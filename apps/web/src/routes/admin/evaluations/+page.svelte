<script lang="ts">
	import type { PageProps } from './$types';

	type Gap = { question: string; timesAsked: number; firstSeen: string };

	let { data }: PageProps = $props();
	let runs = $derived(data.runs as unknown[]);
	let coverageGaps = $derived(data.coverageGaps as Gap[]);
</script>

<div class="eyebrow">Admin</div>
<h1>Evaluations</h1>
<p style="color: var(--fg-muted); margin: 8px 0 20px;">
	Retrieval quality against a curated QA set, plus abstained questions that point at missing docs.
</p>

<div class="card" style="margin-bottom: 24px;">
	<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
		<h2 style="font-size: 15px;">network-runbooks-v1 — MVP targets</h2>
		<button class="btn" disabled title="No evaluation runner yet — see docs/IMPLEMENTATION.md M3">
			Start evaluation run
		</button>
	</div>
	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>Metric</th>
					<th>Target</th>
					<th>Measured</th>
				</tr>
			</thead>
			<tbody>
				<tr><td>Recall@5</td><td class="mono">≥ 0.80</td><td class="mono">—</td></tr>
				<tr><td>MRR@10</td><td class="mono">≥ 0.65</td><td class="mono">—</td></tr>
				<tr><td>Citation validity</td><td class="mono">100%</td><td class="mono">—</td></tr>
				<tr><td>Abstention (unanswerable set)</td><td class="mono">≥ 0.90</td><td class="mono">—</td></tr>
			</tbody>
		</table>
	</div>
	<p style="font-size: 12px; color: var(--fg-muted); margin-top: 10px;">
		{runs.length === 0
			? 'No evaluation runs recorded yet — this is the target table from docs/PRD.md §10, not a result.'
			: `${runs.length} run(s) recorded.`}
	</p>
</div>

<div class="card">
	<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
		<h2 style="font-size: 15px;">Coverage gaps (K-17)</h2>
		<span class="mono" style="font-size: 11px; color: var(--fg-muted);">from answer_cache, real data</span>
	</div>

	{#if coverageGaps.length === 0}
		<p style="color: var(--fg-muted);">
			No abstained questions recorded yet — ask something off-topic in the <a href="/"
				>chat</a
			> to populate this.
		</p>
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Query</th>
						<th>Times asked</th>
						<th>First seen</th>
					</tr>
				</thead>
				<tbody>
					{#each coverageGaps as gap (gap.question)}
						<tr>
							<td>{gap.question}</td>
							<td class="mono">{gap.timesAsked}</td>
							<td class="mono">{new Date(gap.firstSeen).toLocaleString()}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
