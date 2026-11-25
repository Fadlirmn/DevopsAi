<script lang="ts">
	// Dark/light switch: moon on the left, sun on the right, the knob sits on
	// the active one. Same storage/attribute convention as everywhere else
	// (see ui.svelte.ts). Works inside both .chat-app and .admin-app tokens.
	import { onMount } from 'svelte';
	import { currentTheme, setTheme, type Theme } from '#lib/ui.svelte';

	let theme = $state<Theme>('dark');
	onMount(() => (theme = currentTheme()));

	function toggle() {
		theme = theme === 'light' ? 'dark' : 'light';
		setTheme(theme);
	}
</script>

<button
	id="tsw"
	class="tsw"
	type="button"
	role="switch"
	aria-checked={theme === 'light'}
	aria-label="Tema terang"
	title={theme === 'light' ? 'Terang' : 'Gelap'}
	onclick={toggle}
>
	<svg class="tsw-i moon" viewBox="0 0 24 24">
		<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
	</svg>
	<svg class="tsw-i sun" viewBox="0 0 24 24">
		<circle cx="12" cy="12" r="4" /><path
			d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"
		/>
	</svg>
	<span class="tsw-k" aria-hidden="true">
		{#if theme === 'light'}
			<svg viewBox="0 0 24 24">
				<circle cx="12" cy="12" r="4" /><path
					d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"
				/>
			</svg>
		{:else}
			<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
		{/if}
	</span>
</button>
