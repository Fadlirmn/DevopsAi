<script lang="ts">
	// KnowledgeOps AI mark: a citation bracket around a point — every answer
	// points back to its source. Same drawing as assets/favicon.svg.
	let { size = 24 }: { size?: number } = $props();
</script>

<svg
	class="logo"
	viewBox="0 0 32 32"
	aria-hidden="true"
	style="width:{size}px;height:{size}px;stroke:none;flex-shrink:0"
>
	<rect width="32" height="32" rx="8" fill="#3e63dd" />
	<g fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
		<path d="M11.5 9H9.5a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 9.5 23h2" />
		<path d="M20.5 9h2a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5h-2" />
	</g>
	<circle cx="16" cy="16" r="3" fill="#fff" />
</svg>
