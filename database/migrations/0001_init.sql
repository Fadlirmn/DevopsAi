-- 0001_init.sql — core schema (see PRD.md §7)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE collections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL,
 title text NOT NULL, description text NOT NULL DEFAULT '',
 visibility text NOT NULL CHECK (visibility IN ('public','private')),
 status text NOT NULL CHECK (status IN ('draft','published','archived')),
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), collection_id uuid NOT NULL REFERENCES collections(id),
 title text NOT NULL, source_type text NOT NULL, active_version_id uuid NULL,
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE document_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES documents(id),
 version_number int NOT NULL, object_key text NOT NULL, sha256 char(64) NOT NULL,
 mime_type text NOT NULL, bytes bigint NOT NULL,
 status text NOT NULL CHECK (status IN ('pending','processing','ready','failed')),
 error_code text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(document_id,version_number)
);

ALTER TABLE documents ADD CONSTRAINT fk_active_version FOREIGN KEY(active_version_id) REFERENCES document_versions(id);

-- NOTE: vector(768) must match the pinned embedding model's exact output
-- dimension (see PRD.md §7) — verify before running this migration.
CREATE TABLE chunks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
 ordinal int NOT NULL, page_number int, heading text, content text NOT NULL,
 token_count int NOT NULL, embedding vector(768) NOT NULL,
 search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
 UNIQUE(version_id,ordinal)
);
-- No HNSW index at MVP scale — see PRD.md §7. Add it back only after
-- benchmarking shows exact scan (`ORDER BY embedding <=> $1`) is too slow
-- for the real corpus size.
CREATE INDEX chunks_search_gin ON chunks USING gin(search_vector);

CREATE TABLE ingestion_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version_id uuid NOT NULL REFERENCES document_versions(id),
 idempotency_key text NOT NULL UNIQUE, state text NOT NULL CHECK(state IN ('queued','running','succeeded','failed','dead')),
 attempts int NOT NULL DEFAULT 0, locked_until timestamptz, error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE answer_cache (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cache_key char(64) NOT NULL UNIQUE,
 collection_id uuid NOT NULL REFERENCES collections(id), question_text text NOT NULL,
 pipeline_version text NOT NULL, answer jsonb NOT NULL,
 hit_count int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
 last_hit_at timestamptz
);
CREATE INDEX answer_cache_collection_idx ON answer_cache(collection_id);

CREATE TABLE query_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), collection_id uuid NOT NULL REFERENCES collections(id),
 actor_hash text, pipeline_version text NOT NULL, model_id text NOT NULL,
 latency_ms int, input_tokens int, output_tokens int, estimated_cost_usd numeric(12,6),
 status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), query_id uuid NOT NULL REFERENCES query_events(id),
 rating smallint NOT NULL CHECK(rating IN (-1,1)), reason_code text, created_at timestamptz DEFAULT now()
);

CREATE TABLE evaluation_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), config jsonb NOT NULL,
 dataset_version text NOT NULL, metrics jsonb, status text NOT NULL, created_at timestamptz DEFAULT now()
);
