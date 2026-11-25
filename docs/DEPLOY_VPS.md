# VPS deployment runbook — knowledgeops-ai

`infra/compose.yaml` + `apps/web/Dockerfile` + `services/rag/Dockerfile` exist and are runnable (the worker is not containerized yet). Quick start is also in the README's "Run everything in Docker" section.

## 1. Provision
- Supported Ubuntu LTS; SSH key login; nonroot deploy user; patched OS; restrict SSH to a management IP or VPN.
- DNS A/AAAA to VPS; 80/443 publicly available; never open PostgreSQL, object storage admin, workers, or Docker socket. No Prometheus/Grafana in the default stack (JSON logs + `/health/ready` only) — if added later, keep them internal-only too.
- Install supported Docker Engine and Compose v2; grant Docker control only to trusted operators.

## 2. Configure
```bash
cd /opt/knowledgeops-ai
cp infra/.env.example infra/.env
chmod 600 infra/.env
# Edit on the VPS: DOMAIN, HTTP_PORT=80, HTTPS_PORT=443, POSTGRES_PASSWORD, Firebase values.
docker compose -f infra/compose.yaml config --quiet
```
**Security warning:** environment variables and Compose interpolation may leak into `docker inspect`; limit host/operator access and use file-mounted secrets when feasible. Never print expanded config to public logs.

## 3. Deploy
```bash
git pull
# Back up the DB before any new migration (see README for the pg_dump / psql one-liners).
docker compose -f infra/compose.yaml up -d --build
docker compose -f infra/compose.yaml ps          # all services healthy
curl -I https://$DOMAIN/health
```
Images are built on the VPS for now; pulling pinned image digests from a registry is the CI/CD target in §5.

## 4. Operations
- HTTPS test + HTTP redirect, failed-auth checks, public data boundary tests, read-only access verification.
- Keep database and app data in named volumes; copy encrypted backups off-host daily; restore to isolated DB monthly.
- Run `docker compose ps`, validate health probes and disk usage, audit logs and rotation; monitor TLS renewal.
- Keep last release's **immutable image digests** for safe rollback; manual approval for destructive DB operations.
- A one-node VPS is not HA; recovery depends on offsite backup and documented rebuild procedure.

## 5. CI/CD
- PR checks without prod keys -> protected release approval -> build/push immutable images -> pull verified images on VPS via restricted SSH -> migrations -> Compose health + HTTPS smoke -> record release.
- Never run untrusted PR code on a production host runner; do not expose privileged deployment routes via browser.

## 6. Optional Vercel
- Separate deployment of read-only frontend/fixture mode, explicitly labeled synthetic if data is static; not a substitute for running background services or monitoring infrastructure.
