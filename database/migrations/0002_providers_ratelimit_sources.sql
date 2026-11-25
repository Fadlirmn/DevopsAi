-- 0002 — real AI providers, rate limiting, source attribution.
-- Idempotent (IF NOT EXISTS everywhere) so it is safe to re-run.

-- Source attribution for seeded/ingested documents (CC BY needs it).
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS license text;

-- Which embedder produced a version's vectors. Retrieval only searches chunks
-- whose embedder matches the running one: vectors from different models share
-- the dimension (768) but not the meaning, so mixing them returns garbage.
ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS embedding_model text;
UPDATE document_versions SET embedding_model = 'mock:hash-768' WHERE embedding_model IS NULL;

-- Durable fixed-window counters for the public /chat rate limit (PRD K-08:
-- a central store, not per-process memory). actor_hash = sha256(salt + client IP).
CREATE TABLE IF NOT EXISTS rate_limit_counters (
 actor_hash text NOT NULL,
 window_kind text NOT NULL CHECK (window_kind IN ('minute','day')),
 window_start timestamptz NOT NULL,
 hits int NOT NULL DEFAULT 0,
 PRIMARY KEY (actor_hash, window_kind, window_start)
);
CREATE INDEX IF NOT EXISTS rate_limit_counters_start_idx ON rate_limit_counters(window_start);

-- Daily spend-cap check sums today's query_events.
CREATE INDEX IF NOT EXISTS query_events_created_idx ON query_events(created_at);
