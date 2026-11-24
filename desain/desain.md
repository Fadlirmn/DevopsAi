# Desain — KnowledgeOps AI

Catatan kerja buat desain UI. Isinya checklist + referensi, bukan keputusan final — diedit terus sampai desain beneran dipilih. Spec fungsional lengkap ada di `PRD.md` §5 (Experience/UI specification).

## Status
Belum ada desain. Scaffold cuma Tailwind v4 default, markup polos tanpa class. Lihat `README.md` di root buat status repo keseluruhan.

## Referensi nyata (dicek lisensinya, bisa dipake langsung)

| Referensi | Buat apa | Lisensi | Link |
|---|---|---|---|
| **Skeleton v3** (`@skeletonlabs/skeleton-svelte`) | Design system/component library — native Svelte 5 + Tailwind v4, paling pas sama stack kita | Open source (MIT-style) | https://skeleton.dev/docs/svelte |
| **Flowbite Svelte** | Alternatif/pelengkap komponen Tailwind (table, modal, dropdown) kalau Skeleton kurang | MIT (kode), CC BY 3.0 (docs) | https://flowbite-svelte.com |
| **Radix Colors** | Sistem warna accessible 12-step, light+dark otomatis — buat isi requirement "60/30/10 proportion" + WCAG AA di PRD §5 | Open source, no deps, framework-agnostic | https://github.com/radix-ui/colors |
| **Perplexity.ai** (cuma inspirasi UX, bukan kode/aset) | Pola "jawaban AI + sitasi + sources drawer" — paling relevan buat `/demo` page kita | N/A — produk pihak ketiga, jangan clone tampilannya 1:1, cuma ambil pola interaksinya | — |

**Rekomendasi:** pakai Skeleton sebagai base (components + tokens), Radix Colors buat palette dark/light, jangan nambah 2 component library sekaligus (Skeleton + Flowbite) kecuali ada gap spesifik yang Skeleton gak cover.

## Produk sejenis (referensi fitur, bukan kode/tampilan buat dicontek)
Scope project ini **publik/global**, bukan internal perusahaan (lihat PRD §2-3 — single admin, no multi-tenant). Produk paling sebanding:

| Produk | Mirip di bagian mana | Beda |
|---|---|---|
| **Kapa.ai** | Chatbot di atas docs publik, sitasi, abstain kalau gak ketemu evidence, coverage-gap analytics (jadi K-17 di PRD) | SaaS berbayar, bukan open-source |
| **Inkeep** | Citation-first grounding, ada versi open-source/self-hostable | Fokus multi-agent builder, lebih berat |
| **Onyx** (dulu Danswer) | Self-hosted RAG, open source MIT, Docker Compose | Internal enterprise search permission-aware — scope beda, jangan contek model permission-nya |
| **Perplexity.ai** | Pola UX jawaban+sitasi+sources drawer buat `/demo` | Produk web search umum |
| **Supabase AI/Vector docs** | Pola teknis `pgvector` + match function buat semantic search | Dokumentasi/toolkit, bukan produk end-user |

## Checklist per halaman (dari PRD §5)
Tiap baris: apa yang perlu didesain, status.

- [ ] `/` — landing: ringkasan showcase, diagram arsitektur, metrik benchmark, link ke demo
- [ ] `/demo` — collection selector, chat pane, sources drawer, safety notice, retry/clear session
- [ ] `/sources/[id]` — metadata dokumen, preview, anchor halaman/section, highlight chunk yang disitasi
- [ ] `/login` — Firebase Google sign-in (admin only, no signup)
- [ ] `/admin/documents` — upload, daftar versi, timeline ingestion, toggle visibility/publish
- [ ] `/admin/evaluations` — daftar run, tabel Recall@K/MRR/grounding/latency/cost, compare config, tabel coverage-gap (query yang di-abstain, diurut frekuensi)
- [ ] `/admin/settings` — form quota, model version, retrieval params (dengan validasi), provider health

## Komponen lintas-halaman yang bakal kepake berulang
- [ ] Citation marker/footnote (angka klik → buka source drawer)
- [ ] Sources drawer/panel
- [ ] Chat bubble + streaming indicator (SSE)
- [ ] Empty state (belum ada collection/dokumen/hasil)
- [ ] Error/retry banner
- [ ] Status badge (queued/running/succeeded/failed untuk job ingestion)
- [ ] Upload dropzone + progress
- [ ] Metrics table/chart (admin evaluations) — pakai skill `dataviz` kalau udah masuk tahap bikin chart beneran

## Constraint wajib (dari PRD §5, jangan dilanggar pas desain)
- Dark mode default, light mode opsional, proporsi warna 60/30/10
- Kontras warna ≥ WCAG AA
- Keyboard nav + focus state jelas di semua interactive element
- `aria-live` buat update jawaban chat yang streaming
- `prefers-reduced-motion` dihormati
- Jangan render raw HTML dari model (XSS)
