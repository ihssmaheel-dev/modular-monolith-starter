# 0014. Presigned uploads — the server never touches bytes

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from `FILE_UPLOADS.md`, the upload-then-attach flow, slots, and the metadata-mismatch guard.

## Context

Proxying file bytes through the API burns memory, CPU, and request timeouts — and turns every large upload into a denial-of-service vector against the app servers.

## Decision

Upload-then-attach: the API mints a presigned S3-compatible URL (MinIO locally, S3 in cloud), the client PUTs bytes directly to storage, then links the file ID to its parent (note/avatar slot) with ownership verified server-side. A metadata check rejects byte/request mismatches; orphaned uploads are reaped by workers.

## Consequences

Gain: API memory stays flat regardless of file size; uploads scale with storage, not app servers. Pay: a two-step client flow (upload, then attach) with an orphan-reaping obligation, and presigned-URL expiry handling on slow networks.

## Alternatives considered

- Multipart through the API: rejected, memory/CPU per upload plus timeout fragility at scale.
- Base64 inside JSON: rejected, ~33% size bloat plus the same proxying costs.
