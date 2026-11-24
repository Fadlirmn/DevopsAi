<script lang="ts">
	let message = $state('');

	function notWired() {
		message =
			'Not implemented yet — Firebase ID-token verification (PRD.md §9 K-02) is still a stub.';
	}
</script>

<div class="eyebrow">Admin</div>
<h1>Admin login</h1>
<p style="color: var(--fg-muted); margin: 8px 0 20px; max-width: 48ch;">
	Access is limited to one allowlisted Firebase account. Public visitors don't need to sign in —
	the <a href="/demo">demo</a> is open already.
</p>

<div class="card" style="max-width: 360px;">
	<button class="gsignin" type="button" onclick={notWired}>
		<svg width="16" height="16" viewBox="0 0 48 48">
			<path
				fill="#4285F4"
				d="M44.5 20H24v8.5h11.8C34.6 33.9 29.8 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.3 0 6.3 1.2 8.6 3.3l6-6C34.8 4.1 29.7 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.1-2.7-.5-4z"
			/>
		</svg>
		Sign in with Google
	</button>
	{#if message}
		<p style="font-size: 12.5px; color: var(--fg-muted); margin-top: 12px;">{message}</p>
	{/if}
	<p style="font-size: 11.5px; color: var(--fg-muted); margin-top: 12px;">
		No signup flow exists — an unlisted account would be rejected server-side with 403, once
		server-side verification exists.
	</p>
</div>
