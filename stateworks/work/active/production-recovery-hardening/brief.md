# Production Recovery Hardening

## Purpose

Close the final recovery-path defects found after the first healthy production
deployment. The deployed platform is currently healthy; this package concerns
what happens when a release, migration, host, or primary database is not.

## Outcomes

- A failed unverified deployment can be rolled back to an exact prior release
  without losing either the unresolved runtime identity or rollback target.
- Migration execution is conservatively classified as runtime-affecting before
  the database can mutate.
- Recovery restores an encrypted backup into a clean candidate database,
  reapplies roles and grants, runs release-compatible migrations, validates the
  result, and promotes it without colliding with existing `public` or `drizzle`
  objects.
- Backup execution remains authoritative when Sentry or its configuration is
  unavailable; telemetry is bounded and best effort.
- Recovery objectives, immutable secondary storage, off-host secret custody,
  and a full replacement-instance drill remain explicit human gates.

## Non-Goals

- No production release, rollback, restore, host replacement, bucket mutation,
  or secret movement is performed by repository verification.
- No claim is made that nightly backups satisfy an approved business RPO.
- The existing launch and live-vendor gates remain stopped.

## Current External Baseline

On 2026-08-08, the repaired five-image release at source SHA
`a44216cf83223225ab1caeb32a1e20d616ccce47` passed protected-main CI, CodeQL,
artifact publication, normal deployment, and public verification. The deployed
operations bundle and release metadata agree with that SHA; all seven Compose
services were healthy and API/Web/Processor/Control returned HTTP 200. The
root-owned host identity was installed and the stable restore preflight accepted
an approved encrypted backup without restoring data or creating a recovery
journal.

This proves publication and restore admission. It does not prove the natural
03:15 UTC scheduler, approved recovery objectives, independent immutable
custody, off-host escrow, or replacement-host recovery.
