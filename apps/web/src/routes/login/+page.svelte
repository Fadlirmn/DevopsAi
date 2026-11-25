<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
	import { getFirebaseAuth, googleProvider } from '#lib/firebase-client';

	let status = $state<'idle' | 'checking' | 'signing-in' | 'error'>('checking');
	let errorMsg = $state('');

	function nextPath(): string {
		// Same-origin paths only — goto() throws on external URLs (`//x`, `https://x`).
		const next = page.url.searchParams.get('next');
		return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
			? next
			: '/admin/documents';
	}

	async function establishSession(idToken: string) {
		const res = await fetch('/api/v1/auth/session', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ idToken })
		});
		if (res.ok) {
			// refreshAll so the root layout re-reads isAdmin and shows the Admin menu.
			await goto(nextPath(), { refreshAll: true });
			return;
		}
		if (res.status === 403) {
			errorMsg = 'Akun Google ini bukan admin terdaftar.';
			await signOut(getFirebaseAuth());
		} else {
			errorMsg = 'Gagal membuat sesi — coba lagi.';
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
			errorMsg = e instanceof Error ? e.message : 'Gagal masuk.';
			status = 'error';
		}
	}
</script>

<svelte:head><title>Masuk — KnowledgeOps AI</title></svelte:head>

<!-- Not drawn in the mockups; built from chat.html's tokens and controls. -->
<div class="chat-app">
	<div class="main">
		<header class="top">
			<a class="back" href="/">← Kembali ke chat</a>
			<span class="sp"></span>
			<span class="t">KnowledgeOps AI</span>
		</header>
		<div class="center">
			<h1>Masuk</h1>
			<p>
				Hanya untuk akun Firebase yang terdaftar sebagai admin. Pengunjung tidak perlu masuk —
				<a href="/" style="color: var(--acc-txt);">chat</a> sudah terbuka untuk umum.
			</p>
			<button class="pill" type="button" onclick={signIn} disabled={status === 'signing-in'}>
				<svg width="18" height="18" viewBox="0 0 48 48" style="stroke:none">
					<path
						fill="#4285F4"
						d="M44.5 20H24v8.5h11.8C34.6 33.9 29.8 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.3 0 6.3 1.2 8.6 3.3l6-6C34.8 4.1 29.7 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.1-2.7-.5-4z"
					/>
				</svg>
				{status === 'signing-in' ? 'Masuk…' : 'Masuk dengan Google'}
			</button>
			{#if errorMsg}
				<div class="err" role="alert"><span>{errorMsg}</span></div>
			{/if}
			<p style="font-size: 12px;">
				Tidak ada pendaftaran — akun yang tidak terdaftar ditolak server (403).
			</p>
		</div>
	</div>
</div>
