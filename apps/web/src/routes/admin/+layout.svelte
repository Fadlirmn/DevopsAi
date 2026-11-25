<script lang="ts">
	import { goto } from '$app/navigation';
	import { signOut } from 'firebase/auth';
	import { getFirebaseAuth } from '#lib/firebase-client';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	async function logout() {
		await signOut(getFirebaseAuth()).catch(() => {});
		await fetch('/api/v1/auth/logout', { method: 'POST' });
		await goto('/', { invalidateAll: true });
	}
</script>

<div
	style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; font-size: 12.5px; color: var(--fg-muted);"
>
	<span>Signed in as <strong style="color: var(--fg);">{data.adminEmail ?? data.adminUid}</strong></span>
	<button class="btn" style="padding: 5px 10px; font-size: 12px;" onclick={logout}>Sign out</button>
</div>

{@render children()}
