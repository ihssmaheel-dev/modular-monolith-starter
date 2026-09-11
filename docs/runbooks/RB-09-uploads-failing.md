# RB-09: Uploads failing (MinIO/S3, quotas, antivirus)

- **Status note:** presigned flow — the API mints URLs, bytes never touch app servers.
- **Severity:** SEV-2 (single feature family: attachments, avatars)
- **Owner:** backend on-call
- **Last reviewed:** 2026-09-11

## How you notice

- Users report failed uploads/avatars while everything else works; frontend shows
  `metadataMismatch`, quota, or generic upload-failure strings.
- Distinguish the three failure points first: URL minting (API), byte PUT (storage),
  attach/confirm (API again). The error key tells you which — read it before acting.

## Blast radius

Uploads and avatars only. Reads of existing files keep working unless storage itself is
down (then reads fail too — that's a storage outage, treat the MinIO/S3 leg as SEV-1).

## Triage in 5 minutes

1. Which error key? `metadataMismatch` = bytes don't match the request (client/network
   issue, not storage). Quota strings = `FILE_USER_QUOTA_BYTES` reached (policy, not outage).
   Generic failure at mint time = API-side; at PUT time = storage-side.
2. Storage reachable? MinIO console (`:9001` dev / staging ports per environment) or S3
   status; bucket exists (`uploads`); credentials valid (`S3_ACCESS_KEY_ID` family).
3. If `FILE_AV_ENABLED=true`: is the antivirus service (`FILE_AV_URL`) up? A down scanner
   with scanning enforced fails every upload that would otherwise succeed.
4. Recent change to CORS on the bucket? Browser PUTs fail on CORS while server-side checks
   pass — classic after bucket recreation.

## Fix paths

1. **Storage down:** restore MinIO/S3; queued user retries succeed without data loss
   (nothing is half-written — attach only happens after a confirmed PUT). Rollback: N/A.
2. **Quota policy surprise:** confirm the usage numbers first; raising
   `FILE_USER_QUOTA_BYTES` is config-only. Rollback: revert the value.
3. **AV scanner down:** either restore the scanner or consciously bypass (policy decision,
   not an ops toggle — get it in writing).
4. **CORS misconfiguration:** fix bucket CORS; verify with a real browser PUT, not curl.

## Verify

- End-to-end upload + attach + download round-trip as a real user; avatar change works.
- Upload error rate back to baseline in logs.

## Escalate when

- Storage data itself is suspect (corruption, not availability — restore path, not restart).
- Quota/AV decisions need product or security sign-off beyond on-call authority.

## After

- [ ] Postmortem linked here.
- [ ] If CORS or credentials caused it, add the pre-deploy storage checklist item that was missing.
