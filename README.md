# knowledgeops-ai — VPS-first PRD package

**Version:** 2.0 · Date: 2026-11-23

Scope: RAG, pgvector, Python worker, SvelteKit, TLS.

- `PRD.md` — full product requirements, feature/API/data design and VPS-first architecture.
- `IMPLEMENTATION.md` — staged build and deployment implementation checklist.
- `infra/DEPLOY_VPS.md` — VPS deployment topology, operations and constraints.
- `infra/.env.example` — sample environment keys (no credentials).
- `infra/Caddyfile` — HTTPS reverse proxy template, adapt API health/routes.

**Important:** most of the application logic described in the PRD is **not yet implemented**. What exists now is the repo scaffold (Stage 1 of `IMPLEMENTATION.md`): directory layout, an empty SvelteKit shell (`apps/web`), two empty Python packages (`services/rag`, `services/worker`) with the provider interfaces stubbed, and the initial DB migration. Dockerfiles, Compose, ingestion, retrieval and auth logic still need to be built per the milestones in `IMPLEMENTATION.md`.

Default production target: a VPS with Docker Compose. Vercel is optional read-only demo deployment, not a runtime requirement.

## Layout
```
apps/web/            SvelteKit SSR + BFF (scaffolded, no business logic yet)
services/rag/         Python: Embedder/Retriever/Generator interfaces (stubs)
services/worker/      Python: ingestion worker entrypoint (stub)
database/migrations/  Versioned SQL (0001_init.sql = core schema)
packages/contracts/   Shared API types — added once a real endpoint exists
infra/                Caddyfile, .env.example, deployment runbook (compose.yaml: Stage 4)
eval/, docs/, scripts/, .github/workflows/  placeholders for later milestones
```

## Local dev (web shell only)
```bash
cd apps/web && pnpm install && pnpm dev
```
No API/DB wired up yet — this just runs the static shell.
