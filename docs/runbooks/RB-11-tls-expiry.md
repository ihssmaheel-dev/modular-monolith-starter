# RB-11: TLS / certificate expiry

- **Severity:** SEV-1 when expired (all browser traffic); SEV-3 as a scheduled renewal task
- **Owner:** backend on-call
- **Last reviewed:** 2026-09-11

## How you notice

- Browsers show certificate warnings/errors for the app domain while direct-to-port
  health checks still pass (TLS terminates at nginx, not the app — that's the tell).
- Ideally you never "notice" this way: calendar the expiry 30 days out and treat the
  alert, not the outage, as the trigger.

## Blast radius

All browser traffic through nginx when expired (API + web + websockets). Direct API
access and internal service traffic are unaffected, which conveniently leaves your
diagnostic paths open.

## Triage in 5 minutes

1. `echo | openssl s_client -connect <host>:443 -servername <host> 2>/dev/null | openssl x509 -noout -dates` — read `notAfter`. Expired, expiring, or valid?
2. Are cert files present where nginx expects them (`docker/ssl/` mounted to
   `/etc/nginx/ssl/`)? The entrypoint degrades to plain HTTP without them — check whether
   you're looking at a missing-cert fallback or an expired-cert failure; the fixes differ.
3. ACME challenge path reachable? `/.well-known/acme-challenge/` must serve through nginx
   for renewal — a routing change that broke it silently is the usual renewal killer.

## Fix paths

1. **Expired with renewal available:** renew via the ACME flow, place `cert.pem`/`key.pem`,
   reload nginx (`nginx -s reload` — no downtime). Rollback: previous cert pair, kept until
   the new one proves itself.
2. **Challenge path broken:** fix the nginx routing for `/.well-known/` first, verify with
   a test file fetch, then renew. Rollback: N/A.
3. **Renewal infra down:** install the new cert pair manually and reload; fix automation after.
   Rollback: previous pair.

## Verify

- `openssl` shows fresh `notAfter`; browsers load with no warnings in a clean profile
  (cached HSTS/validity can lie — always verify incognito).
- `nginx -t` passes; entrypoint logs show the HTTPS branch, not the plain-HTTP fallback.

## Escalate when

- HSTS preloading turns a cert lapse into an unbypassable outage (no click-through) —
  treat any HSTS domain lapse as SEV-1 immediately.
- Private CA / enterprise client certs involved (their renewal chain is outside this runbook).

## After

- [ ] Postmortem linked here (only if it expired — a lapse is a process failure, not luck).
- [ ] Expiry alert at 30/14/7 days if any leg of it was missing or ignored.
