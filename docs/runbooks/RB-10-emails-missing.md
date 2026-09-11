# RB-10: Emails not arriving

- **Severity:** SEV-2 (SEV-1 during an active incident that depends on email: password resets, invitations)
- **Owner:** backend on-call
- **Last reviewed:** 2026-09-11

## How you notice

- Users report missing welcome/invitation/reset/digest emails while the app otherwise works.
- First question, before anything else: which driver? `EMAIL_DRIVER` is `smtp` or `resend` —
  the entire triage branches here.

## Blast radius

Transactional email only. Password resets and invitations are the sharp edge (users locked
out); digests and welcome emails degrade silently and get noticed late — check them
explicitly even when the complaint is about resets.

## Triage in 5 minutes

1. `EMAIL_DRIVER`, `EMAIL_FROM`, and the driver settings (`SMTP_HOST`/`SMTP_PORT` or
   Resend key) — misconfiguration is the #1 cause, redeploys the #1 source of it.
2. SMTP path: is anything listening? Dev/staging Mailpit (`:8025` dev, `:8026` staging)
   should show the message within seconds of triggering — if it's in Mailpit, sending
   works and the problem is downstream (spam, address typo).
3. Resend path: API key valid and unrotated? Sender domain verified? Check the provider
   dashboard for bounces/blocks before touching our code.
4. Queue side: email jobs stuck upstream? (RB-07 — a stuck queue looks exactly like a
   mail outage from the user's chair.)
5. Template render crash? A broken template fails the send job with an error log naming
   the template — preview it with `pnpm dev:email` instead of guessing.

## Fix paths

1. **Config regression:** restore the driver settings; re-trigger one affected email type
   and confirm. Rollback: previous env values.
2. **Provider issue (blocks/bounces/quota):** follow the provider's remediation (domain
   warm-up, suppression list), switch driver only as a conscious fallback with the new
   sender identity communicated.
3. **Template crash:** fix the template, verify in the email preview workshop, redeploy,
   then re-queue affected sends. Rollback: previous template version.
4. **Queue stuck:** RB-07, then confirm mail flow resumes — don't close this runbook until
   a real email lands.

## Verify

- Trigger each affected email type and confirm arrival (Mailpit locally, real inbox check
  for prod — including spam folder, honestly).
- Send-job error lines stopped; queue depth normal.

## Escalate when

- Auth-critical email (resets/invites) down over 30 minutes with no identified cause.
- Provider-side blocks needing account-owner actions beyond on-call authority.

## After

- [ ] Postmortem linked here.
- [ ] If a template crashed in prod, add the send-path test that would have caught it.
