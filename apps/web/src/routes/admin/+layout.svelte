<script lang="ts">
	// Display copied from docs/mockups/admin.html (side nav, brand, icons, copy).
	import { page } from '$app/state';
	import Toast from '#lib/Toast.svelte';
	import { initials } from '#lib/auth-client';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const is = (href: string) => (page.url.pathname === href ? 'page' : undefined);
</script>

<svelte:head><title>KnowledgeOps AI — Admin</title></svelte:head>

<div class="admin-app">
	<nav class="side" aria-label="Admin">
		<div class="brand">Knowledge<span>Ops</span> AI<small>Panel admin</small></div>
		<a href="/admin/documents" aria-current={is('/admin/documents')}>
			<svg viewBox="0 0 24 24">
				<path d="M8 3h8l4 4v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path
					d="M15 3v5h5"
				/>
			</svg>Dokumen
		</a>
		<a href="/admin/evaluations" aria-current={is('/admin/evaluations')}>
			<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>Evaluasi
		</a>
		<a href="/admin/api-keys" aria-current={is('/admin/api-keys')}>
			<svg viewBox="0 0 24 24">
				<circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3" />
			</svg>API &amp; Kunci
		</a>
		<a href="/admin/settings" aria-current={is('/admin/settings')}>
			<svg viewBox="0 0 24 24">
				<circle cx="12" cy="12" r="3" /><path
					d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"
				/>
			</svg>Pengaturan
		</a>
		<span class="sp"></span>
		<a href="/">
			<svg viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>Kembali ke chat
		</a>
		<div class="who">
			<span class="av">{initials(data.adminEmail)}</span>{data.adminEmail ?? data.adminUid}
		</div>
	</nav>
	<main>
		{@render children()}
	</main>
	<Toast />
</div>
