# knowledgeops-ai

RAG knowledge system for IT docs/incident runbooks — SvelteKit + FastAPI + Postgres/pgvector, VPS-first. Spec/design docs live in `docs/`; everything else below is real source code or infra config.

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

**Planned, not wired up yet** (model/provider still deliberately unpinned — see `docs/PRD.md` §7):

![Vercel](https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white)
![LLM provider](https://img.shields.io/badge/LLM_provider-TBD-lightgrey)
![Embedding provider](https://img.shields.io/badge/Embedding_provider-TBD-lightgrey)

- `docs/PRD.md` — full product requirements, feature/API/data design and VPS-first architecture.
- `docs/IMPLEMENTATION.md` — staged build and deployment implementation checklist.
- `docs/DEPLOY_VPS.md` — VPS deployment topology, operations and constraints.
- `docs/DESIGN.md` — UI design checklist, component list, real-product references.
- `docs/mockups/` — static HTML design mockups (not application code — see `docs/mockups/README.md`).
- `docs/SEED_CORPUS_SOURCES.md` — license-checked real documents used as demo seed data.
- `infra/.env.example` — sample environment keys (no credentials).
- `infra/Caddyfile` — HTTPS reverse proxy template, adapt API health/routes.

**Status:** the query path (cache → retrieve → generate → validate citations) and every page in `docs/PRD.md` §5 are real, running against real Postgres+pgvector, with a deterministic **mock** embedder/LLM (no paid API key needed — see `docs/PRD.md` §15). Admin pages are now gated behind real Firebase ID-token verification (`src/hooks.server.ts` + `src/lib/server/firebase-auth.ts`, PRD.md §9 K-02) — but there's no real Firebase *project* configured yet (`apps/web/.env` has placeholder values), so sign-in itself can't be tested end to end until one exists; every rejection path (no cookie, forged token, bad signature) is verified against Google's real public keys (a forged token now fails on its signature; before the JWK URL fix it failed earlier, on a 404 fetching the keys, which would also have rejected valid tokens). Ingestion (PDF parsing/chunking) is still a stub; see `docs/IMPLEMENTATION.md`.

**Known tooling gap:** `pnpm check` still reports ~7 errors for `#lib/*` and the `Handle` type — module-resolution-only, confirmed harmless by running the actual production build and server (`pnpm build && node build/index.js`), not just reading source. This `@sveltejs/kit` version (3.x) resolves `src/env.ts`, `#lib/*`, and `hooks.server.ts`'s ambient types through a mechanism the installed `svelte-check`/`tsc` CLI doesn't fully support standalone yet. (A real, now-fixed bug this surfaced: this kit version requires env vars exposed to the client to be explicitly declared in `src/env.ts` — see that file — the old "anything prefixed `PUBLIC_` in `.env`" auto-detection is gone.)

Default production target: a VPS with Docker Compose. Vercel is optional, for the frontend + demo-mode fallback (`docs/PRD.md` §6).

## Layout
```
docs/                 Everything written to be read, not run — PRD, implementation plan,
                      deploy runbook, design notes/mockups, seed-corpus sourcing.
apps/web/             SvelteKit SSR + BFF — every page is real, admin pages gated by real Firebase auth
services/rag/         Python FastAPI: real retriever/cache/citation-validator, mock embedder+generator
services/worker/      Python: ingestion worker entrypoint (stub — M1)
database/migrations/  Versioned SQL (0001_init.sql = core schema)
packages/contracts/   Shared API types — added once more endpoints exist
infra/                compose.yaml (full stack, local + VPS), compose.dev.yaml (Postgres only, for hot-reload dev), Caddyfile, .env.example
eval/, scripts/, .github/workflows/  placeholders for later milestones
```

## Run everything in Docker (main way — local and VPS)
Same `infra/compose.yaml` everywhere: Postgres+pgvector, the RAG service, the SvelteKit web app and Caddy. Only Caddy publishes ports; `db` and `rag` sit on an internal-only network (unreachable from the host or the internet, and with no outbound access).
```bash
cp infra/.env.example infra/.env        # set POSTGRES_PASSWORD: openssl rand -hex 32
docker compose -f infra/compose.yaml up -d --build
docker compose -f infra/compose.yaml run --rm rag python scripts/seed_dev.py   # demo data (optional on a VPS)
```
- **Local:** the example defaults (`DOMAIN=:80`, `HTTP_PORT=8080`) serve plain HTTP at `http://localhost:8080` → `/demo`.
- **VPS:** in `infra/.env` set `DOMAIN=your.domain` (DNS A/AAAA pointing at the VPS), `HTTP_PORT=80`, `HTTPS_PORT=443`, then `chmod 600 infra/.env`. Caddy gets the TLS certificate automatically. Firewall: open only 80/443 (+ SSH). See `docs/DEPLOY_VPS.md`.
- **Admin:** fill the `FIREBASE_*`/`ADMIN_UIDS` values in `infra/.env` (see "Admin login" below), then `up -d` again. They're read at container start, so there's no rebuild. Left empty, the demo works and `/admin` stays locked.
- **Update after `git pull`:** `docker compose -f infra/compose.yaml up -d --build`.
- **Logs / status:** `docker compose -f infra/compose.yaml ps` / `logs -f web rag`.
- **Migrations:** `database/migrations/*.sql` auto-apply only on the first start of an empty `db_data` volume. Apply a later one explicitly: `docker compose -f infra/compose.yaml exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < database/migrations/000N_x.sql`.
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
DATABASE_URL=postgresql://knowledgeops_app:dev_only_password@localhost:15432/knowledgeops \
  .venv/bin/python scripts/seed_dev.py            # seeds one demo collection
DATABASE_URL=postgresql://knowledgeops_app:dev_only_password@localhost:15432/knowledgeops \
  .venv/bin/uvicorn rag.app:app --app-dir src --port 8000

# 3. Web, in another shell
cd apps/web && pnpm install
cp .env.example .env   # fill real Firebase values to actually sign in — see below
RAG_SERVICE_URL=http://127.0.0.1:8000 pnpm dev
```
Open `http://localhost:5173/demo`, collection `incident-playbooks` is pre-seeded. The embedder/generator are mocks (`services/rag/src/rag/mock_*.py`) — swap them for real provider adapters once one is pinned (PRD.md §7); nothing else in the request path changes.

### Admin login needs a real Firebase project
`/login` and everything under `/admin/*` require a real Firebase project (free tier is enough):
1. Firebase console → create a project → Authentication → enable the Google sign-in provider.
2. Project settings → General → add a Web app → copy `apiKey`/`authDomain`/`projectId` into `apps/web/.env`'s `PUBLIC_FIREBASE_*` vars.
3. Sign in once with the Google account that should be admin, grab its UID from the Authentication user list, put it in `apps/web/.env`'s `ADMIN_UIDS` and set `FIREBASE_PROJECT_ID` to match.

Without this, `apps/web/.env`'s placeholder values make every admin request fail closed (401/redirect) — that's deliberate, not broken; see `src/lib/server/firebase-auth.ts`.
