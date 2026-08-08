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

On 2026-08-08, read-only checks found the current production release healthy:
all seven Compose services were healthy, API/Web/Processor/Control returned
HTTP 200, native Lightsail alarms were OK, and the latest encrypted backup had
matching local and remote size/checksum evidence in private versioned object
storage. This baseline is not a substitute for the recovery proof in this
package.
