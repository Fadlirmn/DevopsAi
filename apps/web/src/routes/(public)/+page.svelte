<script lang="ts">
	// Display copied from docs/mockups/chat.html (markup, classes, icons, copy);
	// data is real: /api/v1/collections + /api/v1/chat. History is real too,
	// kept per browser in localStorage.
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Toast from '#lib/Toast.svelte';
	import AccountMenu from '#lib/AccountMenu.svelte';
	import Logo from '#lib/Logo.svelte';
	import { say, HISTORY_KEY, DEFAULT_COLLECTION_KEY } from '#lib/ui.svelte';
	import type { PageProps } from './$types';

	type Citation = {
		marker: number;
		chunkId: string;
		documentId: string;
		title: string;
		heading?: string | null;
		page: number | null;
		excerpt: string;
	};
	type ChatResult = {
		answer: string;
		citations: Citation[];
		grounded: boolean;
		cacheHit: boolean;
		/** Vercel demo-mode fixture (backend unreachable) — never a live answer. */
		demo?: boolean;
	};
	type Turn = { q: string; result?: ChatResult; error?: string; loading?: boolean };
	type Chat = {
		id: string;
		title: string;
		collectionSlug: string;
		updatedAt: number;
		turns: Turn[];
	};
	type Collection = { slug: string; title: string; description: string };

	let { data }: PageProps = $props();
	let collections = $derived(data.collections as Collection[]);
	let isAdmin = $derived(page.data.isAdmin as boolean);
	let adminEmail = $derived(page.data.adminEmail as string | null);
	let adminName = $derived(page.data.adminName as string | null);

	const STORE = HISTORY_KEY;
	let chats = $state<Chat[]>([]);
	let currentId = $state<string | null>(null);
	let cleared = $state(false);
	let collectionSlug = $state((data.collections as Collection[])[0]?.slug ?? '');
	let q = $state('');
	let search = $state('');
	let railOpen = $state(false);
	let activeSource = $state('');

	let scrollEl: HTMLDivElement | undefined = $state();

	let current = $derived(chats.find((c) => c.id === currentId) ?? null);
	// Signed-out empty state: centered greeting + composer (component/image copy 2.png).
	let hero = $derived(!isAdmin && !current && !cleared && collections.length > 0);

	function persist() {
		try {
			// never persist an in-flight turn as loading
			const clean = chats.map((c) => ({
				...c,
				turns: c.turns.map((t) => ({ q: t.q, result: t.result, error: t.error }))
			}));
			localStorage.setItem(STORE, JSON.stringify(clean.slice(0, 50)));
		} catch {
			// storage blocked: history just isn't kept
		}
	}

	onMount(() => {
		try {
			const raw = localStorage.getItem(STORE);
			if (raw) chats = JSON.parse(raw) as Chat[];
			const preferred = localStorage.getItem(DEFAULT_COLLECTION_KEY);
			if (preferred && collections.some((c) => c.slug === preferred)) collectionSlug = preferred;
		} catch {
			chats = [];
		}
		// Signed-out visitors get the sidebar open by default on desktop, like the mockup.
		if (!isAdmin && innerWidth > 640) railOpen = true;
		const esc = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && railOpen && innerWidth <= 640) railOpen = false;
		};
		document.addEventListener('keydown', esc);
		return () => document.removeEventListener('keydown', esc);
	});

	async function scrollBottom() {
		await tick();
		if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
	}

	async function ask(question: string, turn?: Turn) {
		if (!question || !collectionSlug) {
			if (!collectionSlug) say('Belum ada collection publik');
			return;
		}
		cleared = false;
		let chat = current;
		if (!chat) {
			chat = {
				id: crypto.randomUUID(),
				title: question.slice(0, 60),
				collectionSlug,
				updatedAt: Date.now(),
				turns: []
			};
			chats.unshift(chat);
			currentId = chat.id;
			chat = chats[0];
		}
		let t: Turn;
		if (turn) {
			t = turn;
			t.result = undefined;
			t.error = undefined;
			t.loading = true;
		} else {
			chat.turns.push({ q: question, loading: true });
			t = chat.turns[chat.turns.length - 1];
		}
		chat.updatedAt = Date.now();
		void scrollBottom();

		try {
			const res = await fetch('/api/v1/chat', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					collectionSlug: chat.collectionSlug,
					message: question,
					history: [],
					clientRequestId: crypto.randomUUID()
				})
			});
			const body = (await res.json()) as ChatResult & { detail?: unknown; message?: string };
			if (!res.ok) {
				const detail = typeof body.detail === 'string' ? body.detail : null;
				t.error = detail ?? body.message ?? `Gagal (${res.status}).`;
			} else {
				t.result = body;
			}
		} catch {
			t.error = 'Koneksi putus. Jawaban belum lengkap.';
		} finally {
			t.loading = false;
			persist();
			void scrollBottom();
		}
	}

	function send() {
		const v = q.trim();
		if (!v) return;
		q = '';
		void ask(v);
	}

	function newChat() {
		currentId = null;
		cleared = false;
		if (innerWidth <= 640) railOpen = false;
	}

	function clearSession() {
		currentId = null;
		cleared = true;
	}

	function openChat(c: Chat) {
		currentId = c.id;
		cleared = false;
		collectionSlug = c.collectionSlug;
		activeSource = '';
		if (scrollEl) scrollEl.scrollTop = 0;
		if (innerWidth <= 640) railOpen = false;
	}

	const DAY = 86_400_000;
	let groups = $derived.by(() => {
		const f = search.toLowerCase();
		const startToday = new Date(new Date().toDateString()).getTime();
		const defs: [string, (t: number) => boolean][] = [
			['Hari ini', (t) => t >= startToday],
			['Kemarin', (t) => t >= startToday - DAY && t < startToday],
			['7 hari lalu', (t) => t >= startToday - 7 * DAY && t < startToday - DAY],
			['Lebih lama', (t) => t < startToday - 7 * DAY]
		];
		return defs
			.map(([g, inG]) => ({
				g,
				i: chats.filter((c) => inG(c.updatedAt) && c.title.toLowerCase().includes(f))
			}))
			.filter((x) => x.i.length);
	});

	/** Split an answer into text and [n] citation markers. */
	function segments(text: string): (string | number)[] {
		return text.split(/\[(\d+)\]/).map((s, i) => (i % 2 ? Number(s) : s));
	}

	/** Highlight words from the question inside a source excerpt (like the mockup's <mark>). */
	function marks(excerpt: string, question: string): { t: string; m: boolean }[] {
		const words = [...new Set(question.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])];
		if (!words.length) return [{ t: excerpt, m: false }];
		// whole words only — "roll" must not light up inside "rollout"
		const re = new RegExp(`\\b(${words.join('|')})\\b`, 'gi');
		return excerpt.split(re).map((t, i) => ({ t, m: i % 2 === 1 }));
	}

	function hl(turnIdx: number, marker: number) {
		activeSource = `${turnIdx}-${marker}`;
		const el = document.getElementById(`s${activeSource}`);
		const det = el?.closest('details');
		if (det) det.open = true;
		el?.scrollIntoView({ block: 'nearest' });
	}

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			say('Tersalin');
		} catch {
			say('Salin manual');
		}
	}

	function notYet(what: string) {
		say(`${what}: belum tersedia`);
	}
</script>

<svelte:head><title>KnowledgeOps AI — Chat</title></svelte:head>

{#snippet composer()}
	<div class="compwrap">
		<div class="comp">
			<button class="ic" aria-label="Lampirkan" onclick={() => notYet('Lampiran')}>
				<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
			</button>
			<input
				id="q"
				type="text"
				placeholder="Tanya dokumen…"
				aria-label="Pertanyaan"
				maxlength="2000"
				bind:value={q}
				onkeydown={(e) => e.key === 'Enter' && send()}
			/>
			<button class="send" id="send" aria-label="Kirim" onclick={send}>
				<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
			</button>
		</div>
	</div>
{/snippet}

<div class="chat-app">
	<nav class="rail" class:open={railOpen} aria-label="Navigasi">
		{#if isAdmin}
			<button
				id="tog"
				aria-expanded={railOpen}
				aria-label={railOpen ? 'Tutup sidebar' : 'Buka sidebar'}
				onclick={() => (railOpen = !railOpen)}
			>
				<svg viewBox="0 0 24 24">
					<rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" />
				</svg><span class="lbl">Riwayat chat</span>
			</button>
			<button class="on" aria-label="Chat" onclick={newChat}>
				<svg viewBox="0 0 24 24">
					<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
				</svg><span class="lbl">Chat</span>
			</button>
		{:else}
			<!-- Signed-out rail: layout from docs/mockups/component/image copy 2.png -->
			{#if railOpen}
				<div class="vhead">
					<span class="vbrand"><Logo size={24} />KnowledgeOps AI</span>
					<button
						id="tog"
						aria-expanded="true"
						aria-label="Tutup sidebar"
						onclick={() => (railOpen = false)}
					>
						<svg viewBox="0 0 24 24">
							<rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" />
						</svg>
					</button>
				</div>
			{:else}
				<button
					id="tog"
					aria-expanded="false"
					aria-label="Buka sidebar"
					onclick={() => (railOpen = true)}
				>
					<svg viewBox="0 0 24 24">
						<rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" />
					</svg>
				</button>
			{/if}
			<button class="vi" aria-label="Chat baru" onclick={newChat}>
				<svg viewBox="0 0 24 24">
					<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
				</svg><span class="lbl">Chat baru</span>
			</button>
			<button class="vi" aria-label="Bantuan" onclick={() => goto('/settings?s=bantuan')}>
				<svg viewBox="0 0 24 24">
					<circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path
						d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"
					/>
				</svg><span class="lbl grow">Bantuan</span>{#if railOpen}<svg
						class="ext"
						viewBox="0 0 24 24"
					>
						<path d="M7 17L17 7M9 7h8v8" />
					</svg>{/if}
			</button>
			<button class="vi" aria-label="Pengaturan" onclick={() => goto('/settings')}>
				<svg viewBox="0 0 24 24">
					<circle cx="12" cy="12" r="3" /><path
						d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"
					/>
				</svg><span class="lbl">Pengaturan</span>
			</button>
		{/if}

		<span class="sp"></span>
		<div class="hist" id="hist">
			{#if isAdmin}<button class="hi" onclick={newChat}>+ Chat baru</button>{/if}
			{#if isAdmin || chats.length}
				{#if !isAdmin}<div class="hg">Riwayat</div>{/if}
				<input
					type="search"
					placeholder="Cari riwayat…"
					aria-label="Cari riwayat"
					bind:value={search}
				/>
				{#if groups.length}
					<div>
						{#each groups as g (g.g)}
							<div class="hg">{g.g}</div>
							{#each g.i as c (c.id)}
								<button class="hi" class:on={c.id === currentId} onclick={() => openChat(c)}>
									<span>{c.title}</span>
								</button>
							{/each}
						{/each}
					</div>
				{:else}
					<div class="hg">{chats.length ? 'Tidak ada hasil.' : 'Belum ada riwayat.'}</div>
				{/if}
			{/if}
		</div>

		{#if isAdmin}
			<AccountMenu {isAdmin} {adminEmail} {adminName} />
		{:else if railOpen}
			<div class="vcard">
				<a href="/login">Masuk</a>
			</div>
		{:else}
			<button aria-label="Masuk" onclick={() => goto('/login')}>
				<svg viewBox="0 0 24 24">
					<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
				</svg>
			</button>
		{/if}
	</nav>

	<div class="main">
		<header class="top">
			<button class="mob" id="menu" aria-label="Buka sidebar" onclick={() => (railOpen = true)}>
				<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
			</button>
			{#if isAdmin || !railOpen}<span class="t"><Logo size={22} />KnowledgeOps AI</span>{/if}
			<!-- No collection picker here: the collection comes from
			     Pengaturan → Umum → Collection default (or the first public one). -->
			<span class="sp"></span>
			{#if isAdmin || current}
				<button id="clear" aria-label="Clear session" onclick={clearSession}>
					<svg viewBox="0 0 24 24">
						<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
					</svg>
				</button>
			{/if}
			{#if !isAdmin}<a class="login-pill" href="/login">Masuk</a>{/if}
		</header>
		<div class="scroll" id="scroll" bind:this={scrollEl}>
			{#if hero}
				<div class="hero">
					<h1>Mau mulai dari mana?</h1>
					{@render composer()}
					<button class="hero-chip" onclick={() => goto('/settings?s=bantuan')}>
						Apa yang bisa ditanyakan?
					</button>
				</div>
			{:else}
				<div class="col" id="log" aria-live="polite" aria-relevant="additions text">
					{#if !current}
						<div class="a" style="color:var(--mute);text-align:center;margin-top:20vh">
							{#if cleared}Sesi kosong. Tanya apa saja.{:else if !collections.length}Belum
								ada collection publik.{:else}Chat baru. Tanya apa saja.{/if}
						</div>
					{:else}
						{#each current.turns as turn, ti (ti)}
							<div class="u">{turn.q}</div>
							<div class="a">
								{#if turn.loading}
									<div class="dots" role="status" aria-label="Menjawab"><i></i><i></i><i></i></div>
								{:else if turn.error}
									<div class="err" role="alert">
										<span>{turn.error}</span><button onclick={() => ask(turn.q, turn)}>
											Retry
										</button>
									</div>
								{:else if turn.result}
									{#if turn.result.demo}
										<div class="demo-banner" role="note">
											Mode demo — server AI sedang tidak terjangkau. Ini contoh jawaban tersimpan.
										</div>
									{/if}
									<!-- prettier-ignore -->
									<p class="ans">{#each segments(turn.result.answer) as seg, si (si)}{#if typeof seg === 'number'}<button class="cite" aria-label={`Sumber ${seg}`} onclick={() => hl(ti, seg)}>{seg}</button>{:else}{seg}{/if}{/each}</p>
									{#if turn.result.citations.length}
										<details class="srcs" open>
											<summary>
												<span>Sumber ({turn.result.citations.length})</span><span
													aria-hidden="true"
												>
													⌄
												</span>
											</summary>
											{#each turn.result.citations as c (c.chunkId)}
												<div
													class="s"
													id={`s${ti}-${c.marker}`}
													class:on={activeSource === `${ti}-${c.marker}`}
												>
													<!-- prettier-ignore -->
													<b>{#if c.documentId}<a href={`/sources/${c.documentId}?chunk=${c.chunkId}`}>{c.heading ?? c.title}</a>{:else}{c.heading ?? c.title}{/if}</b><small>
														{c.heading ? `${c.title} · ` : ''}{c.page ? `hal. ${c.page}` : ''}
													</small>
													<!-- prettier-ignore -->
													<div>…{#each marks(c.excerpt, turn.q) as part, pi (pi)}{#if part.m}<mark>{part.t}</mark>{:else}{part.t}{/if}{/each}…</div>
												</div>
											{/each}
										</details>
									{/if}
									<div class="acts">
										<button aria-label="Salin" onclick={() => copy(turn.result?.answer ?? '')}>
											<svg viewBox="0 0 24 24">
												<rect x="9" y="9" width="11" height="11" rx="2" /><path
													d="M5 15V6a2 2 0 0 1 2-2h9"
												/>
											</svg>
										</button>
										<button aria-label="Jawaban bagus" onclick={() => notYet('Feedback')}>
											<svg viewBox="0 0 24 24">
												<path
													d="M7 11v9H4v-9zM7 11l4-8c1.5 0 2.5 1 2 3l-1 4h6a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 17 20H7"
												/>
											</svg>
										</button>
										<button aria-label="Jawaban kurang" onclick={() => notYet('Feedback')}>
											<svg viewBox="0 0 24 24">
												<path
													d="M7 13V4H4v9zM7 13l4 8c1.5 0 2.5-1 2-3l-1-4h6a2 2 0 0 0 2-2.3l-1-6A2 2 0 0 0 17 4H7"
												/>
											</svg>
										</button>
										<button aria-label="Ulangi" onclick={() => ask(turn.q, turn)}>
											<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" /></svg>
										</button>
									</div>
								{/if}
							</div>
						{/each}
					{/if}
				</div>
			{/if}
		</div>
		{#if !hero}{@render composer()}{/if}
		<div class="note">Jawaban dibuat AI dari dokumen terpilih. Cek sumber untuk info penting.</div>
	</div>

	<Toast />
</div>
