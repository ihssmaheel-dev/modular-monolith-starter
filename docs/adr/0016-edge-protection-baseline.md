# 0016. Edge protection baseline on every route

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** backend
- **Backfilled:** yes — reconstructed from helmet/compress registration, the rate-limit guard, and WAF middleware.

## Context

Abuse (credential stuffing, scraping, payload bombs) is background radiation on any public API. Bolting protection on after the first incident means the incident already happened.

## Decision

Every route ships behind the same baseline: security headers (helmet), gzip compression, per-IP-per-route rate limiting with translated 429 envelopes, and WAF middleware. No route opts out without an explicit, reviewed reason.

## Consequences

Gain: the boring attacks fail by default; abuse knobs exist before they're urgently needed. Pay: misconfigured limits can throttle legitimate bursts (tune per route, watch the metrics), and WAF rules need periodic review or they fossilize.

## Alternatives considered

- CDN/WAF-vendor only: rejected, doesn't protect on-prem/local deployments and outsources a baseline we can own cheaply.
- Nothing until needed: rejected, guarantees the first lesson arrives as an incident.
