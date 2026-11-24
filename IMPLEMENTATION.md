# Implementation Guide — KnowledgeOps AI (VPS-first)

**Status:** build specification; source application and Dockerfiles must be implemented. See `PRD.md` for API contracts, schema, security, tests and acceptance gates. `infra/` includes illustrative deployment templates; adapt paths, image names and secrets before production.

## Target topology
One VPS running Caddy HTTPS -> SvelteKit Node SSR -> FastAPI; PostgreSQL with pgvector and Python ingestion worker on private Compose networks. Private S3-compatible object store or private external managed bucket. Firebase Auth verifies one UID for admin. LLM/embedding provider outbound HTTPS. **Default is VPS, not Vercel**; Vercel is optional read-only showcase mode.

## Stage 0 — prerequisites and DNS
- VPS: supported Ubuntu LTS, Docker Engine + Compose plugin, DNS records for `knowledge.example.com`; baseline 2 vCPU/4 GB/40 GB SSD for small datasets, monitor measured headroom.
- Set SSH key-only access with non-root deploy user; restrict SSH source IP, allow TCP 80/443, install patches; do not open Postgres or object-store administration ports.
- Install `node` LTS + pnpm for developer machine; Python 3.12+ and `uv`; Git; `psql`; test LLM/embedding keys and quotas. Configure off-host encrypted backups.
- Never deploy unreviewed forks using real credentials.

## Stage 1 — repository
```bash
mkdir knowledgeops-ai && cd knowledgeops-ai
git init
mkdir -p apps/web services/{rag,worker} database/migrations infra scripts docs .github/workflows eval/datasets
# Scaffold SvelteKit and Python services using currently supported tool versions.
```
Set Node adapter for SvelteKit SSR; expose only internal port 3000. FastAPI listens on 0.0.0.0:8000 **inside container only**. Worker uses the same Python codebase/service package as API but a separate command for leased ingestion jobs. Define Dockerfile targets for immutable multi-stage non-root images, health endpoints and migrations.

## Stage 2 — data and ingestion
1. Implement migrations from PRD and `CREATE EXTENSION IF NOT EXISTS vector` in a compatible image. Separate DB app and migration credentials; nonroot runtime DB role.
2. Implement server-side Firebase ID token validation + exact UID allowlist. Anonymous can query public published sources only.
3. Implement upload URL/commit with MIME signature, max bytes, SHA-256, quotas and private object-store policy. Do not accept public anonymous uploads.
4. Worker implements lease/heartbeat, retry with exponential backoff, idempotent publish, PDF/MD/TXT parse with resource ceilings, chunk, embeddings and DB batch upsert.
5. Test broken PDFs, version swap, worker crash recovery and private collection exclusion.

## Stage 3 — retrieval + evaluation
1. Write semantic pgvector retrieval with collection and published-version filters.
2. Add full-text retrieval and optional RRF/reranker; pin embedding model/dimension and version indexes.
3. Answer via API with verified citation IDs from retrieved chunks; unsupported query must abstain; enforce token and cost caps.
4. Build seeded public demo UI; upload/admin workflow; 30+ representative QA test cases; report Recall@5, MRR@10 and citation precision.

## Stage 4 — VPS deployment
1. Implement `apps/web/Dockerfile`, `services/rag/Dockerfile`, `services/worker/Dockerfile` and Compose referenced services. Choose external private S3 bucket or add compatible private MinIO service and data volume; DO NOT route public uploads to an unauthenticated MinIO port.
2. Copy `infra/.env.example` to `infra/.env.production` **on VPS only**; fill strong passwords and provider secrets; `chmod 600`. Mount Firebase admin credentials as a secret file and grant least privilege.
3. Configure DNS and `DOMAIN`; deploy Caddy (`infra/Caddyfile`) with ports 80/443 and persisted TLS state; set correct upstream hostnames; ensure ingress path `/api/*` maps to FastAPI without stripping expected route prefix.
4. Run `docker compose -f infra/compose.yaml --env-file infra/.env.production config --quiet` and confirm no secrets accidentally appear in logs; run migration as an explicit one-off job before serving traffic.
5. `docker compose ... up -d --build`; wait on `/health/ready`, validate HTTPS, authenticated admin, public query with citation, private access denied, worker ingestion and backup.
6. Never publish Postgres, worker, object-store admin or Docker API ports. Check firewall and external ports; configure TLS alerts, quotas, timeouts, restart policies, resource caps, log rotation and uptime alerts.

## Stage 5 — CI/CD & operations
- PR gates: TS lint/type/tests; Python lint/type/test; DB integration with pgvector; Compose schema, image/dependency scans, no production secrets.
- Release: protected environment approval, build/push images to GHCR by immutable SHA/digest, SSH pin host keys, pull/verify images on VPS, backup if schema changes, migrate, Compose up + smoke, record digests.
- Rollback: redeploy previous images with compatible schema; manual restore only after restore drill and authorization.
- Backups: daily encrypted Postgres dump to off-host storage; separately protect object store; retention, checksums and monthly isolated restore. A local-only volume is **not** a backup.
- Monitor p95, error ratio, queue backlog, failed ingestion, token cost, disk exhaustion, DB size, renewal failure. Document incident runbooks, quota alerts and provider outages.

## Acceptance checklist
- [ ] Public TLS URL works; HTTP redirects to HTTPS.
- [ ] API and worker continue after VPS restart and worker crash.
- [ ] Anonymous uploads rejected and private collections never appear in public retrieval.
- [ ] End-to-end published PDF -> ingestion -> cited answer passes.
- [ ] External scan shows 80/443 only (SSH optionally restricted to management IP).
- [ ] Off-host encrypted backup and isolated restore verified with recorded actual RPO/RTO.
- [ ] Pinned image rollback tested and previous release metadata preserved.
- [ ] Read-only Vercel alternative documented, not a dependency.

## Implementation issue sequence
1. Foundation + migrations + Docker images.
2. Auth + document management + object storage.
3. Worker leases/ingestion.
4. Retrieval + answer + citations.
5. Evals and quotas.
6. VPS deploy + TLS + firewall + backups + monitoring.
7. Approved CI/CD + rollback drill.
