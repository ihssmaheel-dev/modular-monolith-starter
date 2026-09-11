# RB-XXX: Title — copy this file, never edit it

- **Severity:** SEV-1 (all users down) | SEV-2 (degraded / single feature) | SEV-3 (internal only)
- **Owner:** <team or role — a runbook without an owner is a rumor>
- **Last reviewed:** YYYY-MM-DD

## How you notice

Alert name(s) exactly as in `docker/observability/prometheus/alerts.yml`, the
Grafana dashboard link, and what users report. If there is no alert yet, say so
and file one — every alert must have a runbook and vice versa.

## Blast radius

What is broken vs what is degraded, explicitly. "Everything is down" is banned
unless literally true — partial outages need partial descriptions.

## Triage in 5 minutes

Numbered, copy-pasteable commands. After each command, state what healthy looks
like so a half-asleep human can compare. Prefer read-only commands here.

## Fix paths

Ordered safest-first. Each path gets a one-line rollback note. Never jump to
the destructive path first.

## Verify

The exact metric, log line, or endpoint proving recovery — not "check if it
works", but the command and its expected output.

## Escalate when

Explicit triggers to wake someone. "If unsure" is not a trigger; write the
concrete condition (e.g. "no improvement 15 minutes after the safe fix").

## After

Link the postmortem here. List prevention follow-ups (alert gap? missing
dashboard? config change?) as checkboxes.
