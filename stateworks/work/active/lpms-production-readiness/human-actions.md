# LPMS Production Readiness Human Actions

## Status

`H1` is the next ready vendor-fact gate. `V2` has been re-proven against the
current five-image repository and the completed order-control, resolution, and
exact-redelivery changes. On 2026-07-17, Steven
explicitly authorized temporary unsigned compatibility with Cents' documented
webhook sender so launch is not blocked on signing. Retry, store, bag-count,
reconciliation, and any future signing facts still require live confirmation
before the pilot evidence is complete. The separate
`stateworks/work/done/production-recovery-hardening/` package is complete: it
proves the repaired release, natural hourly dual-destination backup,
exact-version Object Lock retention, independent administration, exact-release
escrow, and the measured replacement-instance drill. Current GoDaddy DNS
administration and ordinary Production Owner TOTP were proven; separate
vault-backed GoDaddy MFA recovery and Production Owner recovery codes remain
accepted nonblocking pre-launch debt and are not claimed as present. None of
that completion advances this package's live-vendor or pilot gates.

## Secret handling

Never paste a signing key, session credential, recovery code, database URL,
private key, raw customer payload, or production connection string into this
file, Git, screenshots, logs, or agent messages. Human evidence records only
non-secret facts, redacted outcomes, timestamps, versions, and hashes.

## H1 — Confirm the live Cents contract and identifiers

Ask the Cents account or implementation contact for written, redacted
confirmation of all of the following:

1. Whether Cents offers any signing or authentication contract beyond the
   ordinary headers shown in its public webhook documentation. This is a
   future hardening fact, not a launch blocker for the authorized unsigned mode.
2. Retry schedule, request timeout, accepted success status range, ordering,
   duplicate behavior, and whether all documented event types are always sent
   to one endpoint.
3. One representative redacted order payload confirming `action` versus
   `event`, `CANCELLED`, `dueDate`, `updatedAt`, services, `unitPrice` versus
   `unitCost`, and decimal-price semantics.
4. The real Cents store identifiers and their intended Pressly locations,
   provided without customer data and recorded here only if the identifiers are
   not sensitive.
5. Whether an authoritative bag-count field exists and whether Cents offers an
   orders-updated-since API, including pagination and rate limits, for
   reconciliation.

Record only the confirmation date, contact or source, non-secret answers,
redacted payload shape, and non-sensitive store mapping below. Never record the
shared HMAC key, signature, raw customer payload, customer identifier, or PII.

### H1 evidence template

- Confirmation date:
- Cents contact/source:
- Signing/authentication capability:
- Retry/timeout/success behavior:
- Payload aliases and money semantics:
- Non-sensitive store-to-location mapping:
- Authoritative bag count available:
- Updated-orders reconciliation API available:
- Adapter mismatch requiring repository repair:

If Cents later supports signing, switch Pressly back to `hmac` mode through a
separate verified rollout. If any wire fact differs from the implemented
adapter, return the work to `T1`/`T2` repair before relying on that event shape.

## Pre-provisioned DevOps evidence — 2026-08-08

This evidence was collected ahead of the ordered human gates. It does not
advance `H2A`–`H2D` or bypass their declared dependencies.

- The production Lightsail host has 8 GiB RAM, 160 GiB storage, and a static IP
  ending in `.111`. Only 80, 443, and rate-limited key-only SSH are public;
  application and database container ports remain private. Host time is
  synchronized in UTC, root SSH login is disabled, and disk usage was 35
  percent.
- The production object-storage bucket is private, tagged for Postgres backup,
  and versioned. The host reaches it through attached-instance resource access;
  the legacy static bucket access key was deleted after credential-free proof.
- The 03:15 UTC schedule produced a complete encrypted backup triplet. Its local
  checksum, remote object size, and remote encrypted-byte readback checksum all
  matched. That natural execution occurred before the stable monitored runner
  was installed at 05:25 UTC. A second, manually invoked backup using only
  instance resource access passed the same checks. These runs prove backup and
  readback behavior, not the post-install natural schedule required by recovery
  V2.
- The second backup restored into an isolated disposable Postgres in 4 seconds.
  Smoke proof found 59 public tables and the identity table. Production
  Postgres remained healthy and its container and volume identities were
  unchanged; the drill left no disposable container or volume.
- A manual hardening-baseline instance snapshot is available. Automatic
  snapshots are enabled at 07:00 UTC, and the new host's first automatic
  snapshot completed successfully on 2026-08-08.
- The active production Worker progress monitor and the three native Lightsail
  alarms were healthy at readback. `pressly-host-capacity` now checks every five
  minutes with a three-failure threshold and has successful production
  check-ins. `pressly-postgres-backup` now checks the 03:15 UTC schedule with a
  one-failure threshold. Its first successful check-in followed a manually
  invoked monitored backup with a real encrypted upload and remote checksum
  readback; it proves the command and telemetry path, not cron or recovery V2.
  No synthetic failure was emitted, so the operator notification route remains
  separate `H2D` evidence.

### Operational rebaseline — 2026-08-09

These facts were also collected ahead of the ordered human gates and do not
advance them:

- Exact release `d7dde6755b7d8c09b81692384a546172fa2651f0` completed protected-main
  CI, CodeQL, immutable five-image publication, deployment, pinned host readback,
  and four-surface public health. Its deployed runner completed the first
  natural `15 * * * *` UTC backup to both the primary and independent secondary
  destination with exact version, size, hash, encryption, Sentry, and post-run
  health readback.
- Exact release `bc0987b98f746cab5d2a97f91c5e3f7892561bb6` completed the same release
  ladder and one real deployment check-in from `in_progress` to `ok`. It
  preserved the exact hourly backup and secondary-destination bindings and left
  all seven services running; the six defined container health checks were
  healthy and Caddy was running.
- Successful backup and deployment check-ins prove monitor ingestion, not
  operator notification. `H2D` still requires a bounded non-PII failure and
  recovery signal to reach and be acknowledged by the operator-owned
  destination.
- Four existing Sentry workflows, IDs `3824547`, `3824545`, `3824558`, and
  `3824618`, were reconciled with `config.frequency=0`. All four read back
  enabled, production-scoped, team-owned, with their detector IDs and active
  team-email actions preserved, and all now include resolved triggers. Only the
  worker-critical workflow `3824547` required adding
  `issue_resolved_trigger`; the other three already had it. This configuration
  readback was collected ahead of the ordered gate. No failure or recovery
  signal was sent, so it does not prove operator delivery, does not advance
  `H2D`, and does not bypass `H2D`'s dependency on `H2C`.
- Exactly three native Lightsail alarms attached to `pressly-44` were separately
  reconciled so `notificationTriggers` is `[ALARM, OK]`. All three remained in
  state `OK`, kept the Email contact with notifications enabled, and preserved
  their exact metrics, thresholds, evaluation periods, datapoints, and
  missing-data policies. No `TestAlarm` or synthetic notification was sent.
  This is ahead-of-order configuration repair only: it proves neither operator
  delivery nor recovery, does not advance `H2D`, and does not bypass `H2C`.

## Later gates

- `H2A`: read back and reconcile the existing 8 GiB host, static IP, firewall,
  time, disk, backup access, and capacity for API, Web, Worker, Processor,
  Control, Caddy, and Postgres. Change external state only to repair a proven
  mismatch.
- `H2B`: read back Web, API, Processor, and Control DNS from two independent
  resolvers and reconcile it with the verified static IP; do not recreate
  healthy records.
- `H2C`: read back the existing production environment and bootstrap files,
  including Control, validate ownership/modes and preflight without printing
  values, and repair only a proven mismatch.
- `H2D`: read back the existing Worker, host, backup, and deployment monitors,
  retain the now-proven backup and deployment success paths, then prove the
  still-open operator notification route with bounded non-PII failure and
  recovery evidence.

These pre-provisioned facts do not advance `H2A`–`H2D`; each gate remains
ordered behind its declared dependency and requires a dated reconciliation
record after it becomes ready.

- `H3`: approve a verified main-branch release for deployment.
- `H4`–`H5`: bootstrap the real facility and enable Cents delivery under the
  explicitly configured ingress mode.
- `H6`–`H7`: approve and operate the controlled happy-path pilot.
- `production-recovery-hardening`: complete under
  `stateworks/work/done/production-recovery-hardening/`; `H1` through `V3` are
  committed after exact-release escrow, measured replacement recovery,
  ordinary-TOTP application proof, and tag-bounded cleanup. Separate
  vault-backed GoDaddy MFA recovery and Production Owner recovery codes remain
  accepted nonblocking pre-launch debt, not proven controls.
