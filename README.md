# knowledgeops-ai — VPS-first PRD package

**Version:** 2.0 · Date: 2026-11-23

Scope: RAG, pgvector, Python worker, SvelteKit, TLS.

- `PRD.md` — full product requirements, feature/API/data design and VPS-first architecture.
- `IMPLEMENTATION.md` — staged build and deployment implementation checklist.
- `infra/DEPLOY_VPS.md` — VPS deployment topology, operations and constraints.
- `infra/.env.example` — sample environment keys (no credentials).
- `infra/Caddyfile` — HTTPS reverse proxy template, adapt API health/routes.

**Status:** the query path (cache → retrieve → generate → validate citations) is real and runs locally end to end, against real Postgres+pgvector, with a deterministic **mock** embedder/LLM (no paid API key needed — see PRD.md §15). Ingestion (PDF parsing/chunking), Firebase auth, and the admin UI are still stubs; see `IMPLEMENTATION.md` for the remaining milestones.

Default production target: a VPS with Docker Compose. Vercel is optional, for the frontend + demo-mode fallback (PRD.md §6).

## Layout
```
apps/web/            SvelteKit SSR + BFF — /demo page and /api/v1/chat proxy are real
services/rag/         Python FastAPI: real retriever/cache/citation-validator, mock embedder+generator
services/worker/      Python: ingestion worker entrypoint (stub — M1)
database/migrations/  Versioned SQL (0001_init.sql = core schema)
packages/contracts/   Shared API types — added once more endpoints exist
infra/                compose.dev.yaml (local Postgres), Caddyfile, .env.example (compose.yaml: Stage 4)
eval/, docs/, scripts/, .github/workflows/  placeholders for later milestones
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
