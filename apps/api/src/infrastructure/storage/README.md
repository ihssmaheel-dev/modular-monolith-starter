# Storage infrastructure

`StorageService` provides one file-storage interface via S3 (Postgres metadata).

## Transfer behaviour

| Driver | Upload                            | Download                          |
| ------ | --------------------------------- | --------------------------------- |
| `s3`   | Short-lived, direct presigned URL | Short-lived, direct presigned URL |

File API returns `uploadMode: "direct"` with a presigned upload URL. Web clients upload directly to S3 via `PUT` passing the exact matching `Content-Type` header requested during presign generation (e.g. `image/png`, `application/pdf`; S3 rejects mismatched `Content-Type` headers with `403 SignatureDoesNotMatch`), then call the confirmation endpoint. Download URLs are short-lived S3 presigned URLs.

Routes stay behind global authentication, tenant context, permission, idempotency, rate-limit, origin-validation, tracing, and error layers.

## Integrity and limits

- Binary streams are capped at their approved file size (maximum `MAX_FILE_SIZE_BYTES`, 10 MB); normal API JSON remains limited to 1 MB.
- A pending record is atomically claimed before S3 confirmation. Only matching content type and byte size move it to `uploaded`.
- Upload failures release the record back to `pending`.
- Download routes expose only `uploaded` files owned by the requesting user (or an administrator) and send a safe attachment filename.

Use `StorageService` from application commands and queries. Do not import S3 drivers from a module directly.
