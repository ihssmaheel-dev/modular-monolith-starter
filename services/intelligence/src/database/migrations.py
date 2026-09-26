import logging

from config import settings
from database.connection import system_connection

logger = logging.getLogger("intelligence.migrations")


def build_migrations_ddl(vector_dimension: int | None = None) -> str:
    """Build idempotent intelligence schema DDL parameterized by vector_dimension."""
    dim = vector_dimension or settings.VECTOR_DIMENSION
    return f"""
-- 1. Ensure pgvector extension exists
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Ensure isolated intelligence schema exists
CREATE SCHEMA IF NOT EXISTS intelligence;

-- 3. Document embeddings table
CREATE TABLE IF NOT EXISTS intelligence.document_embeddings (
    id text PRIMARY KEY,
    tenant_id text NULL,
    source_type text NOT NULL,
    source_id text NOT NULL,
    model_version text NOT NULL,
    content text NOT NULL,
    embedding vector({dim}) NOT NULL,
    metadata jsonb DEFAULT '{{}}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_embeddings_source_unique UNIQUE NULLS NOT DISTINCT (tenant_id, source_type, source_id, model_version)
);

CREATE INDEX IF NOT EXISTS doc_embed_tenant_idx ON intelligence.document_embeddings (tenant_id);
CREATE INDEX IF NOT EXISTS doc_embed_model_idx ON intelligence.document_embeddings (model_version);
CREATE INDEX IF NOT EXISTS doc_embed_tenant_model_idx ON intelligence.document_embeddings (tenant_id, model_version);
CREATE INDEX IF NOT EXISTS doc_embed_fts_gin_idx ON intelligence.document_embeddings USING gin (to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS doc_embed_hnsw_idx ON intelligence.document_embeddings USING hnsw (embedding vector_cosine_ops);

-- Row-Level Security for embeddings
ALTER TABLE intelligence.document_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.document_embeddings FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS intelligence_tenant_isolation_embed ON intelligence.document_embeddings;
    CREATE POLICY intelligence_tenant_isolation_embed ON intelligence.document_embeddings
    FOR ALL
    USING (
        current_setting('app.system_scope', true) = 'true'
        OR (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id IS NULL)
        OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
    )
    WITH CHECK (
        current_setting('app.system_scope', true) = 'true'
        OR (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id IS NULL)
        OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
    );
END $$;

-- 4. Usage and token metrics ledger table
CREATE TABLE IF NOT EXISTS intelligence.usage_ledgers (
    id text PRIMARY KEY,
    tenant_id text NULL,
    user_id text NULL,
    model text NOT NULL,
    prompt_tokens integer DEFAULT 0 NOT NULL,
    completion_tokens integer DEFAULT 0 NOT NULL,
    total_tokens integer DEFAULT 0 NOT NULL,
    cost_estimate_usd double precision DEFAULT 0.0 NOT NULL,
    latency_ms integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS usage_ledger_tenant_idx ON intelligence.usage_ledgers (tenant_id, created_at);

-- Row-Level Security for usage ledgers
ALTER TABLE intelligence.usage_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.usage_ledgers FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS intelligence_tenant_isolation_usage ON intelligence.usage_ledgers;
    CREATE POLICY intelligence_tenant_isolation_usage ON intelligence.usage_ledgers
    FOR ALL
    USING (
        current_setting('app.system_scope', true) = 'true'
        OR (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id IS NULL)
        OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
    )
    WITH CHECK (
        current_setting('app.system_scope', true) = 'true'
        OR (current_setting('app.tenancy_mode', true) = 'single' AND tenant_id IS NULL)
        OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
    );
END $$;
"""


MIGRATIONS_DDL = build_migrations_ddl()


async def run_migrations() -> None:
    """Execute the intelligence schema DDL migrations idempotently within system scope."""
    logger.info("Executing intelligence schema DDL migrations...")
    async with system_connection() as conn:
        await conn.execute(build_migrations_ddl())
    logger.info("Intelligence schema migrations applied successfully.")
