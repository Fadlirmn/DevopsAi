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

**Planned, not wired up yet** (model/provider still deliberately unpinned — see `docs/PRD.md` §7):

![Firebase Auth](https://img.shields.io/badge/Firebase_Auth-FFCA28?logo=firebase&logoColor=black)
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

**Status:** the query path (cache → retrieve → generate → validate citations) and every page in `docs/PRD.md` §5 are real, running against real Postgres+pgvector, with a deterministic **mock** embedder/LLM (no paid API key needed — see `docs/PRD.md` §15). The admin pages show real DB data (not fabricated rows) but have **no auth enforced yet** — don't expose them publicly. Ingestion (PDF parsing/chunking) and Firebase auth are still stubs; see `docs/IMPLEMENTATION.md` for the remaining milestones.

Default production target: a VPS with Docker Compose. Vercel is optional, for the frontend + demo-mode fallback (`docs/PRD.md` §6).

## Layout
```
docs/                 Everything written to be read, not run — PRD, implementation plan,
                      deploy runbook, design notes/mockups, seed-corpus sourcing.
apps/web/             SvelteKit SSR + BFF — every page is real, admin pages have no auth yet
services/rag/         Python FastAPI: real retriever/cache/citation-validator, mock embedder+generator
services/worker/      Python: ingestion worker entrypoint (stub — M1)
database/migrations/  Versioned SQL (0001_init.sql = core schema)
packages/contracts/   Shared API types — added once more endpoints exist
infra/                compose.dev.yaml (local Postgres), Caddyfile, .env.example (compose.yaml: Stage 4)
eval/, scripts/, .github/workflows/  placeholders for later milestones
```

## Local dev (real query path, mock provider)
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
RAG_SERVICE_URL=http://127.0.0.1:8000 pnpm dev
```
Open `http://localhost:5173/demo`, collection `incident-playbooks` is pre-seeded. The embedder/generator are mocks (`services/rag/src/rag/mock_*.py`) — swap them for real provider adapters once one is pinned (PRD.md §7); nothing else in the request path changes.
