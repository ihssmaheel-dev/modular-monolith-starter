import asyncio
import logging
import time
from collections import OrderedDict

import redis.asyncio as aioredis

from config import settings

logger = logging.getLogger("intelligence.replay")

_redis_client: aioredis.Redis | None = None

# In-memory fallback LRU cache: maps request_id -> expiry_timestamp
_MAX_LOCAL_CACHE_SIZE = 10_000
_local_replay_cache: OrderedDict[str, float] = OrderedDict()


def get_redis_client() -> aioredis.Redis:
    """Retrieve or create singleton async Redis client."""
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=2.0,
            socket_connect_timeout=2.0,
        )
    return _redis_client


async def close_redis_client() -> None:
    """Close Redis client during application shutdown."""
    global _redis_client
    if _redis_client is not None:
        try:
            await _redis_client.close()
        except Exception as exc:
            logger.warning(f"Error closing Redis client: {exc}")
        _redis_client = None


def _check_local_cache(request_id: str, ttl_seconds: int) -> bool:
    """
    Thread/task-safe bounded local LRU fallback for replay prevention.
    Returns True if request_id is unique, False if replayed.
    """
    now = time.time()

    # Periodic purge of expired entries from the front of OrderedDict
    while _local_replay_cache:
        oldest_id, oldest_expiry = next(iter(_local_replay_cache.items()))
        if oldest_expiry < now:
            _local_replay_cache.popitem(last=False)
        else:
            break

    if request_id in _local_replay_cache:
        expiry = _local_replay_cache[request_id]
        if expiry >= now:
            return False  # Replay detected
        del _local_replay_cache[request_id]

    if len(_local_replay_cache) >= _MAX_LOCAL_CACHE_SIZE:
        _local_replay_cache.popitem(last=False)  # Evict oldest item

    _local_replay_cache[request_id] = now + ttl_seconds
    return True


async def check_and_record_request(request_id: str, ttl_seconds: int = 300) -> bool:
    """
    Distributed replay guard using Redis SET NX EX 300.
    Returns True if the request is fresh and unique.
    Returns False if the request has already been processed within the TTL window.
    Falls back to a bounded local TTL cache if Redis is unavailable or times out.
    """
    if not request_id:
        return False

    redis_key = f"intelligence:replay:{request_id}"
    try:
        client = get_redis_client()
        # Bound Redis RTT on auth hot path to 500ms before falling back to local LRU cache
        was_set = await asyncio.wait_for(
            client.set(redis_key, "1", ex=ttl_seconds, nx=True),
            timeout=0.5,
        )
        return bool(was_set)
    except Exception as exc:
        logger.debug(f"Redis unavailable for replay check, falling back to local cache: {exc}")
        return _check_local_cache(request_id, ttl_seconds)
