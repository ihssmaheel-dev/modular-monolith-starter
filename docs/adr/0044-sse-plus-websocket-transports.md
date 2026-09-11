# 0044. SSE and WebSocket both, each for its traffic

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from the SSE controller, the WS gateway, and the shared connection registry.

## Context

Live updates need server→client push (feed-style) and occasional bidirectional interaction. One transport stretched over both jobs ends up mediocre at each.

## Decision

SSE for one-way event feeds (auto-reconnect, plain HTTP, proxy-friendly); the WebSocket gateway for interactive traffic. Both register into one connection registry with per-user caps, symmetric add/remove, empty-set cleanup, and session-invalidation disconnects — so neither transport can leak connections. Cross-instance delivery fans out per-replica stream groups (see the realtime scale notes in `PRODUCTION_ARCHITECTURE.md`).

## Consequences

Gain: right tool per direction; SSE covers most product needs with boring HTTP semantics. Pay: two code paths to maintain and test; clients must pick correctly (feed = SSE).

## Alternatives considered

- WebSocket-only: rejected, overkill for one-way feeds and harder through proxies.
- Polling: rejected, latency vs load trade-off is strictly worse with an event stream available; the 60s unread poll remains only as a fallback, not the mechanism.
