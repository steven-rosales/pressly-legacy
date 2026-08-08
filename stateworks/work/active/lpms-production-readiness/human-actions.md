# LPMS Production Readiness Human Actions

## Status

`H1` is the next ready vendor-fact gate. `V2` has been re-proven against the
current five-image repository and the completed order-control, resolution, and
exact-redelivery changes. On 2026-07-17, Steven
explicitly authorized temporary unsigned compatibility with Cents' documented
webhook sender so launch is not blocked on signing. Retry, store, bag-count,
reconciliation, and any future signing facts still require live confirmation
before the pilot evidence is complete. The separate
`production-recovery-hardening` package is also active. Its repaired release,
host identity, and stable restore preflight are proven, but the natural
scheduled backup, immutable custody, approved RPO/RTO, escrow, and replacement-
instance drill must not be inferred from LPMS repository evidence.

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
  then prove the still-open operator notification route with bounded non-PII
  test evidence.

These pre-provisioned facts do not advance `H2A`–`H2D`; each gate remains
ordered behind its declared dependency and requires a dated reconciliation
record after it becomes ready.

- `H3`: approve a verified main-branch release for deployment.
- `H4`–`H5`: bootstrap the real facility and enable Cents delivery under the
  explicitly configured ingress mode.
- `H6`–`H7`: approve and operate the controlled happy-path pilot.
- `production-recovery-hardening`: observe the first natural backup, approve
  RPO/RTO and independent immutable custody, escrow recovery secrets off host,
  and prove a complete replacement-instance recovery before treating disaster
  recovery as complete.
