<script lang="ts">
	import './layout.css';
	import '../lib/components.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	// Each area draws its own shell from its mockup: the chat (docs/mockups/chat.html)
	// in (public)/+page.svelte, the admin panel (docs/mockups/admin.html) in admin/+layout.svelte.
	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>KnowledgeOps AI — Chat</title>
</svelte:head>

{@render children()}
