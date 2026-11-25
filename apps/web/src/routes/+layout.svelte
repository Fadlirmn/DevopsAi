<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let theme = $state<'dark' | 'light'>('dark');

	function applyTheme(mode: 'dark' | 'light') {
		theme = mode;
		document.documentElement.setAttribute('data-theme', mode);
		try {
			localStorage.setItem('ko-theme', mode);
		} catch {
			// ignore — private window / blocked storage
		}
	}

	onMount(() => {
		let stored: string | null = null;
		try {
			stored = localStorage.getItem('ko-theme');
		} catch {
			// ignore
		}
		applyTheme(stored === 'light' ? 'light' : 'dark');
	});

	const PUBLIC_GROUP = { label: 'Knowledge base', links: [{ href: '/', text: 'Chat' }] };
	const ADMIN_GROUP = {
		label: 'Admin',
		links: [
			{ href: '/admin/documents', text: 'Documents' },
			{ href: '/admin/evaluations', text: 'Evaluations' },
			{ href: '/admin/settings', text: 'Settings' }
		]
	};
	// Admin menu only for a verified admin session (see +layout.server.ts).
	let nav = $derived(data.isAdmin ? [PUBLIC_GROUP, ADMIN_GROUP] : [PUBLIC_GROUP]);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="shell">
	<nav class="rail" aria-label="Primary">
		<div class="rail-inner">
			<div>
				<span class="brand-name">KnowledgeOps AI</span>
				<span class="brand-tag">dev build</span>
			</div>

			{#each nav as group (group.label)}
				<div class="nav-group">
					<div class="nav-label">{group.label}</div>
					{#each group.links as link (link.href)}
						<a class="nav-link" class:active={page.url.pathname === link.href} href={link.href}>
							{link.text}
						</a>
					{/each}
				</div>
			{/each}

			<div class="rail-foot">
				{#if !data.isAdmin}
					<a class="nav-link" href="/login" class:active={page.url.pathname === '/login'}>
						Admin login
					</a>
				{/if}
				<button
					class="theme-btn"
					type="button"
					onclick={() => applyTheme(theme === 'dark' ? 'light' : 'dark')}
				>
					{theme === 'dark' ? 'Dark' : 'Light'} mode
				</button>
				<p class="rail-note">
					Query path is real (cache → retrieve → generate → validate). See
					<code>docs/PRD.md</code>.
				</p>
			</div>
		</div>
	</nav>

	<main class="main">
		{@render children()}
	</main>
</div>
