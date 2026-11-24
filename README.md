# knowledgeops-ai

RAG knowledge system for IT docs/incident runbooks — SvelteKit + FastAPI + Postgres/pgvector, VPS-first. Spec/design docs live in `docs/`; everything else below is real source code or infra config.

- `docs/PRD.md` — full product requirements, feature/API/data design and VPS-first architecture.
- `docs/IMPLEMENTATION.md` — staged build and deployment implementation checklist.
- `docs/DEPLOY_VPS.md` — VPS deployment topology, operations and constraints.
- `docs/DESIGN.md` — UI design checklist, component list, real-product references.
- `docs/mockups/` — static HTML design mockups (not application code — see `docs/mockups/README.md`).
- `docs/SEED_CORPUS_SOURCES.md` — license-checked real documents used as demo seed data.
- `infra/.env.example` — sample environment keys (no credentials).
- `infra/Caddyfile` — HTTPS reverse proxy template, adapt API health/routes.

**Status:** the query path (cache → retrieve → generate → validate citations) is real and runs locally end to end, against real Postgres+pgvector, with a deterministic **mock** embedder/LLM (no paid API key needed — see `docs/PRD.md` §15). Ingestion (PDF parsing/chunking), Firebase auth, and the admin UI are still stubs; see `docs/IMPLEMENTATION.md` for the remaining milestones.

Default production target: a VPS with Docker Compose. Vercel is optional, for the frontend + demo-mode fallback (`docs/PRD.md` §6).

## Layout
```
docs/                 Everything written to be read, not run — PRD, implementation plan,
                      deploy runbook, design notes/mockups, seed-corpus sourcing.
apps/web/             SvelteKit SSR + BFF — /demo page and /api/v1/chat proxy are real
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
