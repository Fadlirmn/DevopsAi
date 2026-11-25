<script lang="ts">
	// Settings page. Layout follows docs/mockups/component/image copy.png
	// (sidebar with search + grouped sections, detail rows with label,
	// description and value). Content is only what this app actually has.
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { logout, initials } from '#lib/auth-client';
	import { say, HISTORY_KEY, DEFAULT_COLLECTION_KEY } from '#lib/ui.svelte';
	import Toast from '#lib/Toast.svelte';
	import ThemeSwitch from '#lib/ThemeSwitch.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let isAdmin = $derived(page.data.isAdmin as boolean);
	let adminEmail = $derived(page.data.adminEmail as string | null);
	let adminName = $derived(page.data.adminName as string | null);

	type Section = { id: string; label: string; group: string; admin?: boolean };
	const SECTIONS: Section[] = [
		{
			id: 'keamanan',
			label: 'Keamanan dan login',
			group: 'Akun',
			admin: true
		},
		{
			id: 'akun',
			label: 'Akun',
			group: 'Akun',
			admin: true
		},
		{
			id: 'umum',
			label: 'Umum',
			group: 'Aplikasi'
		},
		{
			id: 'tampilan',
			label: 'Tampilan',
			group: 'Aplikasi'
		},
		{
			id: 'riwayat',
			label: 'Riwayat chat',
			group: 'Data & Privasi'
		},
		{
			id: 'bantuan',
			label: 'Bantuan',
			group: 'Bantuan'
		}
	];

	let search = $state('');
	let visible = $derived(SECTIONS.filter((s) => !s.admin || isAdmin));
	let filtered = $derived(
		visible.filter((s) => s.label.toLowerCase().includes(search.trim().toLowerCase()))
	);
	let groups = $derived([...new Set(filtered.map((s) => s.group))]);
	let active = $derived.by(() => {
		const want = page.url.searchParams.get('s');
		return visible.find((s) => s.id === want) ?? visible[0];
	});

	let defaultCollection = $state('');
	let historyCount = $state(0);

	onMount(() => {
		try {
			defaultCollection = localStorage.getItem(DEFAULT_COLLECTION_KEY) ?? '';
			const raw = localStorage.getItem(HISTORY_KEY);
			historyCount = raw ? (JSON.parse(raw) as unknown[]).length : 0;
		} catch {
			// storage blocked
		}
		if (page.url.hash) document.querySelector(page.url.hash)?.scrollIntoView();
	});

	function open(id: string) {
		void goto(`/settings?s=${id}`, { reset: false });
	}

	function saveDefaultCollection() {
		try {
			if (defaultCollection) localStorage.setItem(DEFAULT_COLLECTION_KEY, defaultCollection);
			else localStorage.removeItem(DEFAULT_COLLECTION_KEY);
			say('Tersimpan di browser ini');
		} catch {
			say('Browser memblokir penyimpanan');
		}
	}

	function clearHistory() {
		if (!historyCount || !confirm(`Hapus ${historyCount} percakapan dari browser ini?`)) return;
		try {
			localStorage.removeItem(HISTORY_KEY);
			historyCount = 0;
			say('Riwayat dihapus');
		} catch {
			say('Browser memblokir penyimpanan');
		}
	}

	function expiry(exp: number | null | undefined): string {
		if (!exp) return '—';
		return new Date(exp * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
	}
</script>

{#snippet ico(id: string)}
	<svg viewBox="0 0 24 24">
		{#if id === 'keamanan'}<rect x="4" y="10" width="16" height="11" rx="2" /><path
				d="M8 10V7a4 4 0 0 1 8 0v3"
			/>{:else if id === 'akun'}<circle cx="12" cy="12" r="9" /><circle
				cx="12"
				cy="10"
				r="3"
			/><path d="M6.5 18a6 6 0 0 1 11 0" />{:else if id === 'umum'}<circle
				cx="12"
				cy="12"
				r="3"
			/><path
				d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"
			/>{:else if id === 'tampilan'}<circle cx="12" cy="12" r="4" /><path
				d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"
			/>{:else if id === 'riwayat'}<rect x="3" y="4" width="18" height="16" rx="2" /><path
				d="M3 9h18M9 13h6"
			/>{:else if id === 'bantuan'}<circle cx="12" cy="12" r="9" /><path
				d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"
			/>{/if}
	</svg>
{/snippet}

<svelte:head><title>Pengaturan — KnowledgeOps AI</title></svelte:head>

<div class="chat-app">
	<div class="setw">
		<aside class="set-side" aria-label="Pengaturan">
			<div class="set-head">
				<span class="set-title">Pengaturan</span>
				<a class="set-x" href="/" aria-label="Kembali ke chat">
					<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
				</a>
			</div>
			<label class="set-search">
				<svg viewBox="0 0 24 24">
					<circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
				</svg><input
					type="search"
					placeholder="Cari"
					aria-label="Cari pengaturan"
					bind:value={search}
				/>
			</label>
			<nav class="set-nav">
				<div class="set-g">Profil</div>
				{#if isAdmin}
					<button class="set-i" onclick={() => open('akun')}>
						<span class="av sm">{initials(adminEmail)}</span><span class="grow">
							{adminName ?? adminEmail}
						</span><svg class="ext" viewBox="0 0 24 24"><path d="M7 17L17 7M9 7h8v8" /></svg>
					</button>
				{:else}
					<a class="set-i" href="/login">
						<span class="av sm">?</span><span class="grow">Pengunjung</span><svg
							class="ext"
							viewBox="0 0 24 24"
						>
							<path d="M7 17L17 7M9 7h8v8" />
						</svg>
					</a>
				{/if}
				{#each groups as g (g)}
					<div class="set-g">{g}</div>
					{#each filtered.filter((s) => s.group === g) as s (s.id)}
						<button class="set-i" class:on={s.id === active.id} onclick={() => open(s.id)}>
							{@render ico(s.id)}{s.label}
						</button>
					{/each}
				{:else}
					<div class="set-g">Tidak ada hasil.</div>
				{/each}
			</nav>
		</aside>

		<main class="set-main">
			<div class="set-body">
				{#if active.id === 'akun' && data.account}
					<h1>Akun</h1>
					<p class="set-sub">Detail akun admin kamu</p>
					<h2>Detail</h2>
					<div class="set-rows">
						<div class="set-row">
							<div><b>Nama</b><small>Nama dari akun Google kamu</small></div>
							<span>{adminName ?? '—'}</span>
						</div>
						<div class="set-row">
							<div><b>Email</b><small>Email akun Google yang dipakai untuk masuk</small></div>
							<span>{adminEmail ?? '—'}</span>
						</div>
						<div class="set-row">
							<div><b>UID</b><small>ID Firebase yang terdaftar di ADMIN_UIDS</small></div>
							<code>{data.account.uid}</code>
						</div>
						<div class="set-row">
							<div><b>Peran</b><small>Hak akses di aplikasi ini</small></div>
							<span>Admin</span>
						</div>
					</div>
					<div class="set-rows gap">
						<div class="set-row">
							<div><b>Keluar</b><small>Akhiri sesi admin di browser ini</small></div>
							<button class="set-danger" onclick={() => logout('/')}>Keluar</button>
						</div>
					</div>
				{:else if active.id === 'keamanan' && data.account}
					<h1>Keamanan dan login</h1>
					<p class="set-sub">Cara akun admin diverifikasi</p>
					<h2>Login</h2>
					<div class="set-rows">
						<div class="set-row">
							<div><b>Metode masuk</b><small>Penyedia login yang dipakai</small></div>
							<span>Google (Firebase Auth)</span>
						</div>
						<div class="set-row">
							<div>
								<b>Project Firebase</b><small>Project yang memverifikasi token login</small>
							</div>
							<span>{data.account.firebaseProjectId || '—'}</span>
						</div>
						<div class="set-row">
							<div>
								<b>Sesi berakhir</b><small>
									Token login berlaku sekitar 1 jam; setelah itu kamu diminta masuk lagi
								</small>
							</div>
							<span>{expiry(data.account.sessionExp)}</span>
						</div>
						<div class="set-row">
							<div>
								<b>Verifikasi server</b><small>
									Token dicek ulang di server pada setiap request
								</small>
							</div>
							<span>Aktif</span>
						</div>
					</div>
				{:else if active.id === 'umum'}
					<h1>Umum</h1>
					<p class="set-sub">Pengaturan dasar chat</p>
					<h2>Chat</h2>
					<div class="set-rows">
						<div class="set-row">
							<div><b>Bahasa</b><small>Bahasa antarmuka</small></div>
							<span>Indonesia</span>
						</div>
						<div class="set-row">
							<div>
								<b>Collection default</b><small>Dipilih otomatis saat membuka chat baru</small>
							</div>
							<select
								bind:value={defaultCollection}
								onchange={saveDefaultCollection}
								aria-label="Collection default"
							>
								<option value="">Pertama di daftar</option>
								{#each data.collections as c (c.slug)}
									<option value={c.slug}>{c.title}</option>
								{/each}
							</select>
						</div>
					</div>
				{:else if active.id === 'tampilan'}
					<h1>Tampilan</h1>
					<p class="set-sub">Atur tampilan aplikasi di browser ini</p>
					<h2>Tema</h2>
					<div class="set-rows">
						<div class="set-row">
							<div><b>Tema</b><small>Tampilan gelap atau terang</small></div>
							<ThemeSwitch />
						</div>
					</div>
				{:else if active.id === 'riwayat'}
					<h1>Riwayat chat</h1>
					<p class="set-sub">Percakapan disimpan hanya di browser ini, tidak dikirim ke server</p>
					<h2>Data</h2>
					<div class="set-rows">
						<div class="set-row">
							<div>
								<b>Percakapan tersimpan</b><small>Di browser ini, maksimal 50 terakhir</small>
							</div>
							<span>{historyCount} percakapan</span>
						</div>
					</div>
					<div class="set-rows gap">
						<div class="set-row">
							<div>
								<b>Hapus semua riwayat</b><small>Menghapus semua percakapan dari browser ini</small>
							</div>
							<button class="set-danger" onclick={clearHistory} disabled={!historyCount}>
								Hapus
							</button>
						</div>
					</div>
				{:else}
					<h1>Bantuan</h1>
					<p class="set-sub">Cara kerja KnowledgeOps AI</p>
					<h2>Cara kerja jawaban</h2>
					<div class="set-rows">
						<div class="set-row">
							<div>
								<b>Sumber jawaban</b><small>
									Jawaban disusun hanya dari dokumen di collection yang dipilih
								</small>
							</div>
						</div>
						<div class="set-row">
							<div>
								<b>Nomor kutipan</b><small>
									Angka seperti <span class="cite">1</span> menunjuk ke potongan dokumen di bagian Sumber;
									klik judulnya untuk membuka dokumen lengkap
								</small>
							</div>
						</div>
						<div class="set-row">
							<div>
								<b>Kalau bukti tidak cukup</b><small>
									AI menolak menjawab daripada menebak, dan pertanyaannya dicatat agar admin bisa
									menambah dokumen
								</small>
							</div>
						</div>
					</div>
					<h2 id="pintasan">Pintasan keyboard</h2>
					<div class="set-rows">
						<div class="set-row">
							<div><b>Kirim pertanyaan</b><small>Di kotak pertanyaan</small></div>
							<code>Enter</code>
						</div>
						<div class="set-row">
							<div>
								<b>Tutup sidebar atau menu</b><small>Menu akun, atau sidebar di layar kecil</small>
							</div>
							<code>Esc</code>
						</div>
						<div class="set-row">
							<div><b>Pindah item menu</b><small>Saat menu akun terbuka</small></div>
							<code>↑ ↓</code>
						</div>
					</div>
				{/if}
			</div>
		</main>
	</div>
	<Toast />
</div>
