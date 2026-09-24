import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import asyncpg
from pgvector.asyncpg import register_vector

from config import settings

logger = logging.getLogger("intelligence.database")

_pool: asyncpg.Pool | None = None


async def _init_connection(conn: asyncpg.Connection) -> None:
    """Initialize each connection in the pool with pgvector support."""
    await register_vector(conn)


async def init_pool() -> asyncpg.Pool:
    """Initialize the asynchronous connection pool to PostgreSQL."""
    global _pool
    if _pool is None:
        logger.info("Initializing PostgreSQL asyncpg connection pool...")
        _pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            min_size=settings.DB_POOL_MIN,
            max_size=settings.DB_POOL_MAX,
            init=_init_connection,
            timeout=10.0,
            command_timeout=30.0,
        )
    return _pool


async def close_pool() -> None:
    """Close the connection pool cleanly during application shutdown."""
    global _pool
    if _pool is not None:
        logger.info("Closing PostgreSQL connection pool...")
        await _pool.close()
        _pool = None


@asynccontextmanager
async def tenant_connection(
    tenant_id: str | None,
) -> AsyncGenerator[asyncpg.Connection, None]:
    """
    Acquires a pooled connection within a dedicated transaction, activating
    PostgreSQL session GUCs for Row-Level Security (RLS) tenant isolation.

    - Multi-tenant: sets app.tenancy_mode = 'multi' and app.current_tenant = tenant_id
    - Single-tenant (tenant_id is None or empty): sets app.tenancy_mode = 'single' and app.current_tenant = ''
    All GUC configurations are transaction-local (is_local=true), automatically reset at commit/rollback.
    """
    pool = await init_pool()
    async with pool.acquire() as connection:
        async with connection.transaction():
            if tenant_id:
                await connection.execute(
                    "SELECT set_config('app.tenancy_mode', 'multi', true), "
                    "       set_config('app.current_tenant', $1, true);",
                    tenant_id,
                )
            else:
                await connection.execute(
                    "SELECT set_config('app.tenancy_mode', 'single', true), "
                    "       set_config('app.current_tenant', '', true);"
                )
            yield connection


@asynccontextmanager
async def system_connection() -> AsyncGenerator[asyncpg.Connection, None]:
    """
    Acquires a connection within a dedicated transaction for migrations and
    maintenance operations, activating app.system_scope = 'true'.
    """
    pool = await init_pool()
    async with pool.acquire() as connection:
        async with connection.transaction():
            await connection.execute("SELECT set_config('app.system_scope', 'true', true);")
            yield connection


@asynccontextmanager
async def get_connection() -> AsyncGenerator[asyncpg.Connection, None]:
    """Acquire a raw connection from the pool without transaction wrapping."""
    pool = await init_pool()
    async with pool.acquire() as connection:
        yield connection
