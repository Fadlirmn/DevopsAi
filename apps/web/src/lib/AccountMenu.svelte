<script lang="ts">
	// Account menu at the bottom of the chat rail. Layout follows
	// docs/mockups/component/image.png (profile header, items, Help with a
	// chevron, Log out). Every item goes somewhere real in this app.
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { logout, initials } from '#lib/auth-client';

	let {
		isAdmin,
		adminEmail,
		adminName
	}: { isAdmin: boolean; adminEmail: string | null; adminName: string | null } = $props();

	let open = $state(false);
	let helpOpen = $state(false);
	let wrap: HTMLDivElement | undefined = $state();
	let trigger: HTMLButtonElement | undefined = $state();

	let displayName = $derived(isAdmin ? (adminName ?? adminEmail ?? 'Admin') : 'Pengunjung');

	onMount(() => {
		const close = (e: MouseEvent) => {
			if (open && wrap && !wrap.contains(e.target as Node)) open = false;
		};
		document.addEventListener('click', close);
		return () => document.removeEventListener('click', close);
	});

	async function toggle(e: MouseEvent) {
		e.stopPropagation();
		open = !open;
		helpOpen = false;
		if (open) {
			await tick();
			wrap?.querySelector<HTMLElement>('.menu button, .menu a')?.focus();
		}
	}

	function keys(e: KeyboardEvent) {
		if (!wrap) return;
		const items = [...wrap.querySelectorAll<HTMLElement>('.menu button, .menu a')];
		const i = items.indexOf(document.activeElement as HTMLElement);
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			items[(i + 1) % items.length]?.focus();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			items[(i - 1 + items.length) % items.length]?.focus();
		} else if (e.key === 'Escape') {
			e.stopPropagation();
			open = false;
			trigger?.focus();
		}
	}

	function go(href: string) {
		open = false;
		void goto(href);
	}
</script>

<div class="accw" bind:this={wrap}>
	<!-- svelte-ignore a11y_interactive_supports_focus -->
	<div
		class="menu acct"
		id="pop"
		role="menu"
		aria-label="Menu akun"
		hidden={!open}
		onkeydown={keys}
	>
		<button role="menuitem" class="me" onclick={() => go(isAdmin ? '/settings?s=akun' : '/login')}>
			<span class="av">{isAdmin ? initials(adminEmail) : '?'}</span>
			<span class="me-t">
				<span class="me-n">{displayName}</span><span class="me-r">
					{isAdmin ? 'Admin' : 'Belum masuk'}
				</span>
			</span>
			<svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
		</button>
		<hr />
		{#if isAdmin}
			<a role="menuitem" href="/admin/documents" onclick={() => (open = false)}>
				<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></svg>Panel
				admin
			</a>
			<button role="menuitem" onclick={() => go('/settings?s=akun')}>
				<svg viewBox="0 0 24 24">
					<circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
				</svg>Profil
			</button>
		{/if}
		<button role="menuitem" onclick={() => go('/settings')}>
			<svg viewBox="0 0 24 24">
				<circle cx="12" cy="12" r="3" /><path
					d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"
				/>
			</svg>Pengaturan
		</button>
		<hr />
		<button role="menuitem" aria-expanded={helpOpen} onclick={() => (helpOpen = !helpOpen)}>
			<svg viewBox="0 0 24 24">
				<circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path
					d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"
				/>
			</svg>Bantuan<svg class="chev" class:down={helpOpen} viewBox="0 0 24 24">
				<path d="M9 6l6 6-6 6" />
			</svg>
		</button>
		{#if helpOpen}
			<button role="menuitem" class="subi" onclick={() => go('/settings?s=bantuan')}>
				Cara kerja jawaban
			</button>
			<button role="menuitem" class="subi" onclick={() => go('/settings?s=bantuan#pintasan')}>
				Pintasan keyboard
			</button>
		{/if}
		{#if isAdmin}
			<button role="menuitem" onclick={() => logout('/')}>
				<svg viewBox="0 0 24 24">
					<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
				</svg>Keluar
			</button>
		{:else}
			<button role="menuitem" onclick={() => go('/login')}>
				<svg viewBox="0 0 24 24">
					<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
				</svg>Masuk
			</button>
		{/if}
	</div>
	<button
		class="acc"
		id="prof"
		bind:this={trigger}
		aria-haspopup="menu"
		aria-expanded={open}
		aria-label="Menu profil"
		onclick={toggle}
	>
		<span class="av">{isAdmin ? initials(adminEmail) : '?'}</span><span class="lbl">
			{isAdmin ? 'Admin' : 'Pengunjung'}
		</span>
	</button>
</div>
