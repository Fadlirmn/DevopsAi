<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
	import { getFirebaseAuth, googleProvider } from '#lib/firebase-client';

	let status = $state<'idle' | 'checking' | 'signing-in' | 'error'>('checking');
	let errorMsg = $state('');

	function nextPath(): string {
		return page.url.searchParams.get('next') || '/admin/documents';
	}

	async function establishSession(idToken: string) {
		const res = await fetch('/api/v1/auth/session', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ idToken })
		});
		if (res.ok) {
			await goto(nextPath());
			return;
		}
		if (res.status === 403) {
			errorMsg = "This Google account isn't an allowlisted admin.";
			await signOut(getFirebaseAuth());
		} else {
			errorMsg = 'Could not establish a session — try again.';
		}
		status = 'error';
	}

	onMount(() => {
		// Firebase persists sign-in across page loads; if the server cookie
		// expired but the client is still signed in, refresh it silently
		// instead of asking the admin to click the button again.
		const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (user) => {
			if (user) {
				status = 'signing-in';
				await establishSession(await user.getIdToken());
			} else {
				status = 'idle';
			}
		});
		return unsubscribe;
	});

	async function signIn() {
		status = 'signing-in';
		errorMsg = '';
		try {
			const cred = await signInWithPopup(getFirebaseAuth(), googleProvider);
			await establishSession(await cred.user.getIdToken());
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Sign-in failed.';
			status = 'error';
		}
	}
</script>

<div class="eyebrow">Admin</div>
<h1>Admin login</h1>
<p style="color: var(--fg-muted); margin: 8px 0 20px; max-width: 48ch;">
	Access is limited to one allowlisted Firebase account. Public visitors don't need to sign in —
	the <a href="/demo">demo</a> is open already.
</p>

<div class="card" style="max-width: 360px;">
	<button class="gsignin" type="button" onclick={signIn} disabled={status === 'signing-in'}>
		<svg width="16" height="16" viewBox="0 0 48 48">
			<path
				fill="#4285F4"
				d="M44.5 20H24v8.5h11.8C34.6 33.9 29.8 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.3 0 6.3 1.2 8.6 3.3l6-6C34.8 4.1 29.7 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.1-2.7-.5-4z"
			/>
		</svg>
		{status === 'signing-in' ? 'Signing in…' : 'Sign in with Google'}
	</button>
	{#if errorMsg}
		<p style="font-size: 12.5px; color: var(--bad); margin-top: 12px;">{errorMsg}</p>
	{/if}
	<p style="font-size: 11.5px; color: var(--fg-muted); margin-top: 12px;">
		No signup flow — an unlisted account is rejected server-side with 403.
	</p>
</div>
