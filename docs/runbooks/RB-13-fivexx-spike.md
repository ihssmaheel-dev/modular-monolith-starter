# RB-13: 5xx spike with error references

- **Severity:** SEV-1 (broad) / SEV-2 (single endpoint — scope it first, don't assume)
- **Owner:** backend on-call
- **Last reviewed:** 2026-09-11

## How you notice

- 5xx rate alert or user reports with `ref #xxxxxxxx` strings — this runbook assumes the
  error-reference system is your primary tool: every API failure carries an 8-hex ref
  derived from the trace ID, shown on frontend error boundaries with a copy button.
- First job: one ref. A single reference (`ref #a3f9c1e4`) beats a thousand log lines.

## Blast radius

Scope by endpoint before declaring: one route 500ing (bad deploy, validation gap) vs
everything 500ing (dependency down → RB-01/02/03). The ref system tells you in one lookup
instead of one dashboard spelunk.

## Triage in 5 minutes

1. Take one `ref #` from a report or the frontend. In Loki: filter for the 8 hex chars —
   the structured error log carries `traceId`, `requestId`, and the stack.
2. Follow the Grafana derived `TraceID` field into Jaeger for the full distributed trace —
   which service, which span, which downstream call failed.
3. Check the envelope `code`: validation/config errors (fix forward, small) vs
   `SERVER_ERROR` with connection timeouts (dependency — jump to the matching runbook).
4. Correlate start time with deploys — a step-change at deploy time is a rollback candidate.

## Fix paths

1. **Bad deploy, step-change at release:** roll back to the previous image tag first,
   investigate second. Rollback: forward redeploy of the fix.
2. **Dependency failure in the trace:** follow the failing span to its runbook
   (Postgres RB-02, Redis RB-03, storage RB-09) — don't treat the symptom here.
3. **Validation/config regression:** fix forward (key, schema, env), redeploy; confirm
   with the same ref-producing request replayed safely.

## Verify

- 5xx rate back to baseline; fresh requests produce no new refs for the failing route.
- The original reporting user flow works end to end (not just the endpoint — the journey).

## Escalate when

- Refs implicate data corruption or a security boundary (auth/permissions) rather than
  availability — different severity, different responders.
- The spike has no deploy correlation and no dependency cause after 15 minutes.

## After

- [ ] Postmortem linked here, with the exemplar ref quoted in it.
- [ ] Missing test for the failing shape; alert threshold review if detection lagged.
