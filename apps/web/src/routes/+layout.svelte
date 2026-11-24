<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

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

	const NAV = [
		{
			label: 'Public',
			links: [
				{ href: '/', text: 'Overview' },
				{ href: '/demo', text: 'Demo' }
			]
		},
		{
			label: 'Admin',
			links: [
				{ href: '/login', text: 'Login' },
				{ href: '/admin/documents', text: 'Documents' },
				{ href: '/admin/evaluations', text: 'Evaluations' },
				{ href: '/admin/settings', text: 'Settings' }
			]
		}
	];
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

			{#each NAV as group (group.label)}
				<div class="nav-group">
					<div class="nav-label">{group.label}</div>
					{#each group.links as link (link.href)}
						<a
							class="nav-link"
							class:active={page.url.pathname === link.href}
							href={link.href}
						>
							{link.text}
						</a>
					{/each}
				</div>
			{/each}

			<div class="rail-foot">
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
