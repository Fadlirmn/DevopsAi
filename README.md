# knowledgeops-ai

RAG knowledge system for IT docs/incident runbooks — SvelteKit + FastAPI + Postgres/pgvector, VPS-first. Spec/design docs live in `docs/`; everything else below is real source code or infra config.

## Screenshots

**Tampilan awal** (`/`, belum masuk) — chat publik, tidak perlu login:

![Tampilan awal: chat publik](docs/screenshots/home.png)

**Admin → Dokumen** (`/admin/documents`, khusus admin terdaftar) — daftar dokumen, versi, status ingestion, dan visibilitas:

![Panel admin: halaman Dokumen](docs/screenshots/admin-documents.png)

<sub>Diambil dari stack Docker lokal (provider mock). Email di screenshot admin adalah placeholder.</sub>

## Stack

**Running today:**

![SvelteKit](https://img.shields.io/badge/SvelteKit-FF3E00?logo=svelte&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![pgvector](https://img.shields.io/badge/pgvector-4169E1)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Caddy](https://img.shields.io/badge/Caddy-1F88C0?logo=caddy&logoColor=white)
![Firebase Auth](https://img.shields.io/badge/Firebase_Auth-FFCA28?logo=firebase&logoColor=black)

**AI provider (dipilih lewat env):**

![Claude](https://img.shields.io/badge/Anthropic_Claude-191919?logo=anthropic&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?logo=openai&logoColor=white)
![Gemini](https://img.shields.io/badge/Google_Gemini-8E75B2?logo=googlegemini&logoColor=white)
![Ollama](https://img.shields.io/badge/OpenAI--compatible_(Ollama%2C_Groq%2C_OpenRouter)-000000?logo=ollama&logoColor=white)

**Demo opsional:** ![Vercel](https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white) (frontend di Vercel, backend di VPS)

- `docs/PRD.md` — full product requirements, feature/API/data design and VPS-first architecture.
- `docs/IMPLEMENTATION.md` — staged build and deployment implementation checklist.
- `docs/DEPLOY_VPS.md` — VPS deployment topology, operations and constraints.
- `docs/DESIGN.md` — UI design checklist, component list, real-product references.
- `docs/mockups/` — static HTML design mockups. The app's UI is a 1:1 copy of `chat.html` (public chat, `/`) and `admin.html` (admin panel, `/admin/*`). `apps/web/src/routes/layout.css` is generated from those two files by `python3 scripts/gen_mockup_css.py`, so change the mockup and re-run the script rather than editing the CSS by hand. Mockup controls that have no backend yet (upload, public API keys, saving settings, feedback, attachments) are shown but answer with a "belum tersedia" toast. They never show fake data. `docs/mockups/component/` (account menu + settings screenshots) is implemented as `src/lib/AccountMenu.svelte` and `/settings`. Both show only real data: the verified Google name/email/UID, session expiry, Firebase project, theme, default collection, and local chat history.
- `docs/SEED_CORPUS_SOURCES.md` — license-checked real documents used as demo seed data.
- `infra/.env.example` — sample environment keys (no credentials).
- `infra/Caddyfile` — HTTPS reverse proxy (everything goes to the SvelteKit BFF); `infra/Caddyfile.vercel` + `infra/compose.vercel.yaml` — the Vercel + VPS demo overlay.

**Status:** the query path (rate limit → cache → retrieve → generate → validate citations) and every page in `docs/PRD.md` §5 are real, running against real Postgres+pgvector. The LLM and embedder are chosen by env: a deterministic **mock** by default (no API key needed — `docs/PRD.md` §15), or Claude / OpenAI / Gemini / any OpenAI-compatible server (see "AI provider" below). The seed corpus (NIST, CISA, Kubernetes, PostgreSQL docs) is downloaded and ingested automatically. Admin pages are now gated behind real Firebase ID-token verification (`src/hooks.server.ts` + `src/lib/server/firebase-auth.ts`, PRD.md §9 K-02) — but there's no real Firebase *project* configured yet (`apps/web/.env` has placeholder values), so sign-in itself can't be tested end to end until one exists; every rejection path (no cookie, forged token, bad signature) is verified against Google's real public keys (a forged token now fails on its signature; before the JWK URL fix it failed earlier, on a 404 fetching the keys, which would also have rejected valid tokens). Seed-corpus ingestion (PDF/HTML parsing, chunking, embedding) is real (`services/rag/src/rag/ingest.py`); admin *upload* ingestion (the worker) is still a stub — see `docs/IMPLEMENTATION.md`.

**Known tooling gap:** `pnpm check` still reports ~7 errors for `#lib/*` and the `Handle` type — module-resolution-only, confirmed harmless by running the actual production build and server (`pnpm build && node build/index.js`), not just reading source. This `@sveltejs/kit` version (3.x) resolves `src/env.ts`, `#lib/*`, and `hooks.server.ts`'s ambient types through a mechanism the installed `svelte-check`/`tsc` CLI doesn't fully support standalone yet. (A real, now-fixed bug this surfaced: this kit version requires env vars exposed to the client to be explicitly declared in `src/env.ts` — see that file — the old "anything prefixed `PUBLIC_` in `.env`" auto-detection is gone.)

Default production target: a VPS with Docker Compose. Vercel is optional, for the frontend + demo-mode fallback (`docs/PRD.md` §6).

## Layout
```
docs/                 Everything written to be read, not run — PRD, implementation plan,
                      deploy runbook, design notes/mockups, seed-corpus sourcing.
apps/web/             SvelteKit SSR + BFF — every page is real, admin pages gated by real Firebase auth
services/rag/         Python FastAPI: retriever/cache/citation-validator, provider adapters (mock, anthropic,
                      openai, gemini, openai-compatible), rate limit, seed-corpus ingestion
services/worker/      Python: ingestion worker entrypoint (stub — M1)
database/migrations/  Versioned SQL, applied by services/rag/scripts/migrate.py (0001 core schema,
                      0002 providers + rate limit + source attribution)
packages/contracts/   Shared API types — added once more endpoints exist
infra/                compose.yaml (full stack, local + VPS), compose.vercel.yaml (Vercel demo overlay),
                      compose.dev.yaml (Postgres only, for hot-reload dev), Caddyfile(.vercel), .env.example
scripts/              gen_mockup_css.py (mockups -> layout.css), security_check.py (black-box security test)
eval/, .github/workflows/  placeholders for later milestones
```

## Run everything in Docker (main way — local and VPS)
Same `infra/compose.yaml` everywhere: Postgres+pgvector, the RAG service, the SvelteKit web app and Caddy, plus two one-shot jobs. Only Caddy publishes ports. `db` is on an internal-only network; `rag` can additionally reach the internet (outbound only) to call the AI provider.
```bash
cp infra/.env.example infra/.env        # set POSTGRES_PASSWORD and RAG_API_KEY: openssl rand -hex 32
docker compose -f infra/compose.yaml up -d --build
```
On every `up`:
- **`migrate`** applies `database/migrations/*.sql` once each (tracked in `schema_migrations`); `rag` starts only after it succeeds.
- **`seed`** downloads the seed corpus and ingests it — `SEED_SET=all` (default) loads every document in "Dokumen awal" below. First run takes ~10 s with the mock embedder; later runs skip unchanged documents. Originals are cached in the `corpus_cache` volume. A source that can't be downloaded is skipped with a warning and never blocks the app (`docker compose -f infra/compose.yaml logs seed`).
- **Local:** the example defaults (`DOMAIN=:80`, `HTTP_PORT=8080`) serve plain HTTP at `http://localhost:8080` (the chat is the home page).
- **VPS:** in `infra/.env` set `DOMAIN=your.domain` (DNS A/AAAA pointing at the VPS), `HTTP_PORT=80`, `HTTPS_PORT=443`, then `chmod 600 infra/.env`. Caddy gets the TLS certificate automatically. Firewall: open only 80/443 (+ SSH). See `docs/DEPLOY_VPS.md`.
- **Admin:** fill the `FIREBASE_*`/`ADMIN_UIDS` values in `infra/.env` (see "Admin login" below), then `up -d` again. They're read at container start, so there's no rebuild. Left empty, the demo works and `/admin` stays locked.
- **Update after `git pull`:** `docker compose -f infra/compose.yaml up -d --build`.
- **Logs / status:** `docker compose -f infra/compose.yaml ps` / `logs -f web rag`.
- **Migrations:** automatic (the `migrate` job). Add a new `database/migrations/000N_name.sql` and run `up -d` again.
- **Security check:** `python3 scripts/security_check.py` (or pass `https://your.domain`) — see "Keamanan" below.
- **Tests:** `services/rag/.venv/bin/python services/rag/tests/test_core.py` (Python) and `cd apps/web && pnpm test` (serverless demo parser; also fails if its prompt drifts from the Python one).
- **Backup:** `docker compose -f infra/compose.yaml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > backup.sql.gz`. Copy it off the host.
- **Wipe everything (incl. data):** `docker compose -f infra/compose.yaml down -v`.

Not containerized yet: the ingestion worker (still a stub, `services/worker`).

## Local dev without Docker for the app (hot reload; real query path, mock provider)
```bash
# 1. Postgres + pgvector, migration applies automatically on first start
docker compose -f infra/compose.dev.yaml up -d db

# 2. RAG service
cd services/rag
python3 -m venv .venv && .venv/bin/pip install -e .
export DATABASE_URL=postgresql://knowledgeops_app:dev_only_password@localhost:15432/knowledgeops
.venv/bin/python scripts/migrate.py               # schema
.venv/bin/python scripts/seed_corpus.py --set all # documents (cached in eval/datasets/raw/)
.venv/bin/uvicorn rag.app:app --app-dir src --port 8000   # provider env vars: see "AI provider"

# 3. Web, in another shell
cd apps/web && pnpm install
cp .env.example .env   # fill real Firebase values to actually sign in — see below
RAG_SERVICE_URL=http://127.0.0.1:8000 pnpm dev
```
Open `http://localhost:5173/` (the chat); the `it-ops` collection is seeded. Without provider env vars the embedder/generator are the mocks (`services/rag/src/rag/mock_*.py`).

### Admin login needs a real Firebase project
`/login` and everything under `/admin/*` require a real Firebase project (free tier is enough):
1. Firebase console → create a project → Authentication → enable the Google sign-in provider.
2. Project settings → General → add a Web app → copy `apiKey`/`authDomain`/`projectId` into `apps/web/.env`'s `PUBLIC_FIREBASE_*` vars.
3. Sign in once with the Google account that should be admin, grab its UID from the Authentication user list, put it in `apps/web/.env`'s `ADMIN_UIDS` and set `FIREBASE_PROJECT_ID` to match.

Without this, `apps/web/.env`'s placeholder values make every admin request fail closed (401/redirect) — that's deliberate, not broken; see `src/lib/server/firebase-auth.ts`.

## AI provider (dipilih lewat env)

Provider diatur di `infra/.env` (Docker) lalu `docker compose -f infra/compose.yaml up -d`. Tidak ada pengaturan provider di UI, dan API key tidak pernah dikirim ke browser.

| Variabel | Nilai | Keterangan |
|---|---|---|
| `LLM_PROVIDER` | `mock` · `anthropic` · `openai` · `gemini` · `openai-compatible` | Model yang menyusun jawaban. Default `mock` (tanpa API key). |
| `LLM_MODEL` | mis. `claude-haiku-5-5` | **Default = tier termurah:** `claude-haiku-5-5` (anthropic), `gemini-flash-lite-latest` (gemini, alias Google ke rilis Lite terbaru). OpenAI/openai-compatible **wajib** diisi karena katalognya sering berubah. Tanya-jawab dokumen tidak butuh model besar; naikkan hanya kalau kualitas terbukti kurang. |
| `LLM_API_KEY` | kunci provider | Wajib untuk anthropic/openai/gemini. |
| `LLM_BASE_URL` | mis. `http://host.docker.internal:11434/v1` | Wajib untuk `openai-compatible` (Ollama, Groq, OpenRouter, vLLM, …). |
| `LLM_EFFORT` | `low` (default) … `max` | Khusus Claude: kedalaman berpikir. Tanya-jawab dokumen cukup `low`. |
| `EMBEDDING_PROVIDER` | `mock` · `openai` · `gemini` · `openai-compatible` | Model untuk mencari potongan dokumen. **Anthropic tidak punya API embedding**, jadi kalau LLM-nya Claude, pasangkan dengan provider lain. |
| `EMBEDDING_MODEL` | default `text-embedding-3-small` (openai), `gemini-embedding-001` (gemini) | `openai-compatible` wajib diisi, mis. `nomic-embed-text`. |
| `EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` | | Kosong → ikut `LLM_*` kalau provider-nya sama. |

**Embedding harus 768 dimensi** (`vector(768)` di database). OpenAI dan Gemini diminta mengeluarkan 768 dimensi otomatis; untuk server openai-compatible pilih model yang memang 768 (mis. `nomic-embed-text`). Kalau tidak cocok, request ditolak dengan pesan jelas, bukan disimpan diam-diam.

**Setelah mengganti `EMBEDDING_*`, embed ulang dokumen:**
```bash
docker compose -f infra/compose.yaml run --rm seed python scripts/seed_corpus.py --reembed
```
Retrieval hanya mencari potongan yang di-embed oleh embedder yang sedang aktif (`document_versions.embedding_model`), jadi vektor dari model lama tidak tercampur. Selama belum di-embed ulang, chat akan menolak menjawab; Admin → Pengaturan/API & Kunci menunjukkan provider aktif. Ganti provider atau model juga otomatis mengosongkan cache jawaban (`PIPELINE_VERSION` dihitung dari provider + model).

Contoh konfigurasi:
```bash
# Claude + embedding OpenAI
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-...
EMBEDDING_PROVIDER=openai
EMBEDDING_API_KEY=sk-...

# Ollama lokal (gratis): ollama pull llama3.1 && ollama pull nomic-embed-text
LLM_PROVIDER=openai-compatible
LLM_MODEL=llama3.1
LLM_BASE_URL=http://host.docker.internal:11434/v1
EMBEDDING_PROVIDER=openai-compatible
EMBEDDING_MODEL=nomic-embed-text
```
Detail Claude: dipanggil lewat SDK resmi `anthropic` dengan structured output (JSON terjamin), `effort` dari `LLM_EFFORT`, dan *server-side refusal fallback* untuk model yang mendukungnya. Kalau tetap ditolak, jawabannya teks penolakan baku. Error provider (kunci salah, kena limit provider, jaringan) → 503 "Layanan AI sedang tidak tersedia", tidak pernah 500.

## Dokumen awal (seed corpus)

Diunduh dari sumber resminya saat `seed` berjalan, lalu dipotong per bagian dan di-embed ke koleksi **IT Ops & Incident Response** (`it-ops`). File asli tidak di-commit (`eval/datasets/raw/`, gitignored).

| Dokumen | Lisensi | `SEED_SET=demo` | `SEED_SET=all` |
|---|---|:-:|:-:|
| [NIST SP 800-61 Rev. 2](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-61r2.pdf) — Computer Security Incident Handling Guide | Public domain (U.S. Gov) | ✅ | ✅ |
| [CISA Incident & Vulnerability Response Playbooks](https://www.cisa.gov/sites/default/files/2023-02/Federal_Government_Cybersecurity_Incident_and_Vulnerability_Response_Playbooks_508C.pdf) | Public domain (U.S. Gov) | | ✅ |
| Kubernetes Docs — [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/), [Debug Pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/), [Debug Running Pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/) | CC BY 4.0 © The Kubernetes Authors | | ✅ |
| PostgreSQL Docs — [SQL Dump](https://www.postgresql.org/docs/current/backup-dump.html), [Continuous Archiving & PITR](https://www.postgresql.org/docs/current/continuous-archiving.html), [Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html) | PostgreSQL License | | ✅ |

- **Docker (default):** `SEED_SET=all`, semua 8 dokumen (± 500 potongan).
- **Demo Vercel:** `SEED_SET=demo`, hanya NIST SP 800-61r2 (± 200 potongan). Ini juga sumber kutipan untuk jawaban contoh saat mode demo.
- Halaman `/sources/<id>` menampilkan URL asli dan lisensinya (atribusi wajib untuk CC BY).
- Daftar sumber ada di `services/rag/src/rag/ingest.py` (`SOURCES`). Tambah dokumen baru di sana, lalu `up -d` lagi.

## Rate limit & batas biaya

| Perlindungan | Default | Keterangan |
|---|---|---|
| Per IP pengunjung | `RATE_LIMIT_PER_MINUTE=10`, `RATE_LIMIT_PER_DAY=100` | Dihitung di Postgres (`rate_limit_counters`), jadi berlaku lintas restart dan lintas instance Vercel. IP disimpan sebagai hash bersalt, bukan IP mentah. Lewat batas → **429** + header `Retry-After` + pesan "Terlalu banyak pertanyaan. Coba lagi dalam N detik." |
| Admin | tidak dibatasi | Hanya sesi admin yang terverifikasi server. Header `x-rate-exempt` dari browser diabaikan. |
| Biaya harian global | `DAILY_SPEND_CAP_USD` (kosong = tanpa batas) | Begitu biaya hari ini tercapai, pertanyaan **baru** ditolak (**503**) sampai besok; jawaban dari cache tetap jalan (gratis). Harga model Claude sudah diketahui; provider lain isi `LLM_PRICE_INPUT_PER_MTOK` / `LLM_PRICE_OUTPUT_PER_MTOK`. |
| Ambang off-topic | `RETRIEVAL_MIN_SIMILARITY` (kosong = tidak ada) | Kalau tidak ada potongan dokumen yang cukup mirip, ditolak **tanpa memanggil AI**. Nilainya tergantung model embedding, jadi kalibrasi dengan pertanyaan asli. |

## Keamanan

Lapisan yang berlaku:
- **SQL injection:** semua query memakai parameter asyncpg (`$1`, `$2`, …); tidak ada SQL yang dirangkai dari string input.
- **Pertanyaan di luar topik / prompt injection (bahasa apa pun):** model wajib mengutip potongan dokumen. Jawaban tanpa kutipan valid **selalu diganti** teks baku "Maaf, dokumen di koleksi ini tidak membahas pertanyaan itu…", apa pun yang ditulis model. Nomor kutipan palsu dibuang. Isi dokumen diperlakukan sebagai teks tak tepercaya di system prompt.
- **RAG API tidak bisa diakses langsung:** di Docker tidak dipublikasikan sama sekali. Di mode Vercel wajib `RAG_API_KEY` (tanpa kunci → 401).
- **Admin:** token Firebase diverifikasi ulang di server pada setiap request; `/sources/<id>` hanya menerima UUID (menutup path traversal ke `/admin/*`).
- **XSS:** semua teks (pertanyaan, jawaban, isi dokumen) dirender sebagai teks, tanpa `{@html}`.
- **Header keamanan** dari Caddy (`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`), dan batas ukuran body request.

**Uji keamanan otomatis** (black-box, lewat pintu publik seperti penyerang):
```bash
python3 scripts/security_check.py                    # lokal, http://localhost:8080
python3 scripts/security_check.py https://domain.com # VPS
```
Isinya: SQL injection di semua input, path traversal, auth admin (tanpa cookie, token palsu `alg=none`, token Firebase palsu), pemalsuan header (`x-internal-key`, `x-rate-exempt`, `X-Forwarded-For`), validasi input (2001 karakter, kosong, JSON rusak, body 2 MB), header keamanan, 10 pertanyaan off-topic/prompt injection (Inggris, Indonesia, Mandarin, Arab, Jepang, role-play "DAN", trik base64, payload XSS), dan rate limit. Hasil terakhir di Docker lokal: **36/36 lolos**. Uji tambahan manual yang juga lolos: payload XSS di browser tidak menjalankan script, batas biaya `0` → 503, dan port RAG tertutup dari host.

> Catatan jujur: dengan `LLM_PROVIDER=mock`, uji off-topic membuktikan lapisan retrieval + penegakan kutipan, **bukan** perilaku model AI sungguhan. Setelah API key diisi, jalankan skrip yang sama lagi. Skrip ini menghabiskan kuota rate limit IP-mu selama ±1 menit.

## Demo di Vercel

Demo bisa jalan **hanya di Vercel, tanpa VPS**, dan tetap dijawab AI sungguhan dari 1 dokumen (NIST SP 800-61r2). Dokumen lain otomatis tersedia begitu VPS aktif.

| Mode | Kapan aktif | Dokumen | AI |
|---|---|---|---|
| **1. VPS** | `RAG_SERVICE_URL` diisi dan VPS hidup | Semua (seed corpus) | ✅ provider di VPS |
| **2. AI serverless** | `LLM_PROVIDER` diisi di Vercel, dan VPS tidak diisi atau mati | NIST SP 800-61r2 (bawaan build) | ✅ provider di Vercel |
| **3. Jawaban contoh** | `DEMO_FALLBACK=1`, tidak ada AI | NIST (1 contoh tersimpan) | ❌ (banner kuning "Mode demo") |

Urutannya otomatis: VPS → AI serverless → jawaban contoh. Kalau VPS hidup tapi menolak (rate limit, batas biaya, provider error), pesan aslinya yang ditampilkan. Kalau VPS hang, beralih dalam ±3 detik (cek `/health` dulu).

**Cara kerja mode 2 (`apps/web/src/lib/server/demo/`):**
1. Validasi input dan **rate limit per IP** di **Upstash Redis** (dihitung bersama oleh semua instance serverless).
2. Cache jawaban (7 hari) dan **batas biaya harian**.
3. AI menerjemahkan pertanyaan (bahasa apa pun) menjadi kata kunci Inggris. Kalau di luar topik, AI menjawab `NONE` dan proses berhenti di sini, tanpa panggilan kedua.
4. Pencarian **BM25** di `nist-index.json` (200 potongan, dibuat oleh `services/rag/scripts/export_demo_index.py` dengan extractor yang sama dengan VPS).
5. AI menjawab hanya dari potongan itu, dalam format JSON berkutipan. Jawaban tanpa kutipan valid **selalu diganti** teks penolakan baku.

Prompt, aturan kutipan, dan teks penolakannya sama persis dengan VPS. API key hanya ada di server Vercel, tidak pernah sampai ke browser.

### Langkah deploy (Vercel saja, tanpa VPS)
1. vercel.com → **Add New → Project** → import repo ini.
   - **Root Directory:** `apps/web`. SvelteKit terdeteksi otomatis, dan build otomatis memakai `adapter-vercel` dengan runtime **Node 24**.
   - **Settings → General → Node.js Version:** `24.x`.
2. **Storage / Marketplace → Upstash for Redis → Create** (free tier) → hubungkan ke project. Env **`KV_REST_API_URL`** dan **`KV_REST_API_TOKEN`** terisi otomatis; hanya dua nama ini yang dibaca. Kalau diisi manual dari console.upstash.com, salin nilai bagian **REST API** ke dua nama tersebut, bukan `REDIS_URL` (`rediss://`).
3. **Environment Variables:**

| Nama | Contoh | Wajib |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` · `openai` · `gemini` · `openai-compatible` | ✅ |
| `LLM_API_KEY` | kunci provider | ✅ (kecuali openai-compatible lokal) |
| `LLM_MODEL` | kosongkan = termurah: `claude-haiku-5-5` / `gemini-flash-lite-latest`; OpenAI wajib diisi | sesuai provider |
| `LLM_BASE_URL` | untuk openai-compatible (Groq, OpenRouter, …) | sesuai provider |
| `LLM_FALLBACK_MODEL` | mis. `gemini-3.5-flash-lite` (boleh beberapa, pisahkan koma) | opsional: dicoba berurutan kalau model utama overload/tidak ditemukan. Spasi/titik di akhir dibuang otomatis |
| `DAILY_SPEND_CAP_USD` | `1` | sangat disarankan untuk demo publik |
| `RATE_LIMIT_PER_MINUTE` / `RATE_LIMIT_PER_DAY` | `10` / `100` (default) | – |
| `DEMO_FALLBACK` | `1` | disarankan: kalau provider bermasalah, tetap ada jawaban contoh |
| `SETTINGS_SECRET` | acak, min. 16 karakter: `openssl rand -base64 32` | untuk ganti model dari web: mengenkripsi API key yang disimpan di Redis. Kalau diganti, key yang tersimpan harus diisi ulang |
| Firebase (`PUBLIC_FIREBASE_*`, `FIREBASE_PROJECT_ID`, `ADMIN_UIDS`) | | opsional, hanya untuk login admin |

4. **Deploy.** Fungsi chat diberi `maxDuration: 60` detik, karena ada 2 panggilan AI per pertanyaan baru.

**Ganti model dari web** (tanpa redeploy): **Admin → API & Kunci → Model API → Ganti**. Butuh Upstash dan `SETTINGS_SECRET`.
- Ada preset Gemini, Claude, OpenAI, DeepSeek, OpenRouter, Groq, dan Lainnya (OpenAI-compatible, base URL harus `https://`).
- Model dicek dulu ke provider (gratis, tanpa token); kalau gagal, tidak disimpan.
- Disimpan di Redis (`settings:llm`, API key terenkripsi AES-256-GCM) dan **menang atas env**. Semua instance memakainya dalam ±30 detik.
- API key boleh dikosongkan: dipakai key yang sudah tersimpan untuk provider yang sama, atau `LLM_API_KEY` kalau env memakai provider yang sama.
- **Kembali ke env** menghapus pengaturan web. Kalau Redis mati atau key tidak bisa dibuka, env yang dipakai.
- Hanya untuk mode serverless; layanan RAG di VPS tetap membaca `.env`-nya sendiri.

**Kalau provider overload** (mis. Gemini 503 "high demand") atau model tidak ditemukan, urutannya:
1. SDK mencoba ulang otomatis (±1 s, 2 s).
2. Model di `LLM_FALLBACK_MODEL` dicoba berurutan.
3. **Khusus Gemini:** alias resmi Google, termurah dulu: `gemini-flash-lite-latest` lalu `gemini-flash-latest`. Google sendiri yang menjaga alias ini selalu menunjuk ke rilis terbaru, jadi tidak perlu mengisi apa pun.
4. Kalau `DEMO_FALLBACK=1`, jawaban contoh berbanner tampil. Error baru muncul kalau semuanya gagal.

Error kuota (`429 … quota`) dan model yang tidak ada dilewati 10 menit; model yang baru overload dilewati 60 detik, dan model yang terakhir berhasil dicoba lebih dulu, jadi pengunjung berikutnya tidak ikut menunggu retry.

**Batas waktu:** fungsi chat Vercel diberi `maxDuration` 60 detik, dan satu pertanyaan dibatasi **50 detik total**. Setiap model hanya boleh memakai separuh sisa waktu, jadi model yang lambat atau menggantung tidak menghabiskan jatah model cadangan. Timeout per panggilan default 25 detik (`LLM_TIMEOUT_S`). Gemini dipanggil dengan tingkat berpikir **rendah** (`thinkingLevel: LOW` untuk 3.x), karena tanya-jawab dokumen tidak butuh penalaran panjang dan jauh lebih cepat. Hasilnya, pengunjung selalu mendapat jawaban, jawaban contoh, atau pesan, tidak pernah *timeout* dari Vercel.

Mode 2 tidak butuh API embedding, jadi Claude saja sudah cukup. Biaya per pertanyaan baru = 2 panggilan AI kecil; pertanyaan berulang diambil dari cache (gratis). Tanpa Upstash (atau saat Upstash tidak terjangkau), yang tersisa hanya rate limit per instance di memori: **cache jawaban dan batas biaya harian tidak aktif** (ada peringatan di log). Untuk demo publik, pakai Upstash dan pasang juga batas pengeluaran di dashboard provider.

**Login admin di mode Vercel-only:** tetap berfungsi, karena verifikasi token terjadi di server Vercel. Tambahkan domain Vercel di Firebase → Authentication → Settings → **Authorized domains**. Isi panel admin (dokumen, evaluasi) kosong sampai VPS aktif.

### Nanti, saat VPS aktif (semua dokumen)
VPS dijalankan dengan overlay Vercel:
```bash
# infra/.env di VPS
DOMAIN=knowledge.domain-kamu.com
RAG_DOMAIN=rag.domain-kamu.com        # DNS A record -> IP VPS
RAG_API_KEY=<openssl rand -hex 32>
SEED_SET=all                          # semua dokumen
LLM_PROVIDER=...  EMBEDDING_PROVIDER=...   # lihat "AI provider"

docker compose -f infra/compose.yaml -f infra/compose.vercel.yaml up -d --build
curl -s -o /dev/null -w '%{http_code}\n' https://rag.domain-kamu.com/collections   # 401 = terkunci dengan benar
```
Lalu di Vercel tambahkan `RAG_SERVICE_URL=https://rag.domain-kamu.com` dan `RAG_API_KEY` (nilai yang sama), kemudian redeploy. Chat otomatis memakai VPS (semua dokumen). Mode 2 tetap jadi cadangan kalau VPS mati.
