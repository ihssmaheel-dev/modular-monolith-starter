# 0023. Stable error envelope plus trace-correlated reference IDs

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** contracts
- **Backfilled:** no — decided during implementation on this date.

## Context

Raw errors leak internals and untranslated strings; "something broke, try again" gives support nothing to hold. Users deserve a reference, support deserves a lookup key, and neither should see a stack trace.

## Decision

Every failure returns the stable envelope: machine `code`, i18n key, translated message, status, `requestId`, plus optional `traceId` and an 8-hex `errorRef` derived from the OpenTelemetry trace (request-ID fallback when no span is active). Transported in REST headers and the oRPC error payload alike; the frontend shows `ref #a3f9c1e4` with a copy-details action that pastes reference, trace, request, and timestamp.

## Consequences

Gain: support goes from "what happened?" to a Loki/Jaeger lookup in one paste; API errors stay translated and stable for clients. Pay: every error path must construct the envelope (the filter centralizes it), and reference display must never leak the underlying message.

## Alternatives considered

- Raw error passthrough: rejected, leaks internals and breaks translation.
- Request ID only, no short ref: rejected, UUIDs don't survive being read over the phone; the 8-hex ref exists for humans.
