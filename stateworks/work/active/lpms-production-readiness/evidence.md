# LPMS Production Readiness Evidence

## Work

- Work ID: `lpms-production-readiness`
- Network: `stateworks/work/active/lpms-production-readiness/network.yaml`
- Canonical design: `docs/plan/lpms.md`
- Domain memory: `stateworks/memory/domains/laundry-production/`
- Started: `2026-07-12T11:19:47-04:00`
- Starting branch: `lpms`
- Starting commit: `ea823aa`

## Baseline Preservation

The work started from a dirty tree containing the uncommitted, locally verified
LPMS happy-path implementation and unrelated pre-existing changes. The full
starting inventory was captured with `git status --short` before edits. No
existing user change was discarded, reset, or overwritten as cleanup.

## T0 — Production-readiness baseline

Status: committed

The queued brief was reconciled against the current checkout and the Cents help
article as retrieved on 2026-07-12. The public article documents six event
kinds and an inconsistent order sample (`action` versus `event`, `unitCost`
versus the `unitPrice` field legend, `CANCELLED`, `storeId`, `dueDate`, and
`updatedAt`). It does not document the required timestamped HMAC semantics,
retry behavior, authoritative bag count, or updated-since reconciliation API;
those remain the external `H1` gate.

### Gap matrix

| Surface               | Verified baseline                                                                                                                                            | Required repair                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Vendor contract       | Internal Cents schema requires synthetic `eventId`, numeric `sourceVersion`, `occurredAt`, and `bagCount`.                                                   | Isolate the real documented wire variants and normalize into a minimized canonical command.                                 |
| Ingress security      | Express preserves raw bytes and limits the route body, but the live verifier always fails closed.                                                            | Add timestamped HMAC verification, replay window, constant-time comparison, key rotation, and redacted signals.             |
| Durable receipt       | Inbox stores the complete parsed envelope plus a canonical-object hash.                                                                                      | Store canonical LPMS input or minimal ignored metadata plus the exact raw-body SHA-256 digest; never retain irrelevant PII. |
| Projection            | CRM ordering uses an invented integer source version; bag count defaults to zero.                                                                            | Order by `source_updated_at`, surface equal-time divergence, and model intake as missing rather than zero.                  |
| Location boundary     | Shifts and stations carry location IDs, but Cents store mapping, CRM orders, configs, and several repository reads are not location-authoritative.           | Add explicit location/store ownership and enforce location scope through persistence and every command/read.                |
| Operator capabilities | Happy-path scheduling and floor commands exist.                                                                                                              | Add location discovery, intake, workspace resume, resource bootstrap, and bounded operator recovery capabilities.           |
| Processor             | Runtime defaults to demo data unless `?live=1`; source contains `location-1`, frozen July 2026 dates, and an opaque token in browser storage.                | Remove runtime fixtures, use same-origin cookie/CSRF auth, discover location, and restore server workspace.                 |
| Worker                | Durable leasing, retry, dead-letter, and reconciliation ports exist. Runtime uses null signal sinks and does not schedule a verified reconciliation adapter. | Add production signals, heartbeat/stall proof, bounded replay, and explicit unsupported-reconciliation state.               |
| Release               | Local Compose includes Worker and Processor. Production Compose, Caddy, release manifest, deploy, and rollback still cover only API and Web.                 | Produce and atomically operate four immutable application images behind Caddy.                                              |
| External setup        | No live Cents contract confirmation, Processor DNS, four-runtime host proof, facility bootstrap, or alert configuration exists.                              | Stop at the ordered human gates after offline repository proof.                                                             |

### T0 verification

```text
command: focused Contracts, Production, API, Worker, Processor, and architecture tests
exit: 0
time: 2026-07-12T11:25:20-04:00
summary: 9 contract, 6 production, 41 API, 6 worker, 18 processor, and 53 architecture tests passed before production-readiness implementation.
```

```text
command: stateworks network validation; laundry-production memory validation; canonical-doc term check; git diff --check
exit: 0
time: 2026-07-12T11:24:00-04:00
summary: the 25-task active network and memory v4 validate; docs record HMAC, source timestamp, store/location, intake, Processor, Worker, and four-image decisions with no whitespace errors.
```

## Verification Log

Commands, outcomes, repairs, and redacted proof will be appended here as tasks
are completed.

## T1-T2 — Real Cents ingress and authenticated receipt

Status: committed

- The public Cents wire is isolated from canonical production input. Documented
  aliases, cancellation spelling, source timestamps, store ownership, and
  decimal money normalize at one adapter.
- Exact raw bytes are authenticated with versioned HMAC-SHA256, a symmetric
  five-minute clock window, fixed-length constant-time comparison, and current
  plus previous rotation keys before JSON parsing or persistence.
- Durable receipts retain canonical LPMS facts and a raw-body digest. Customer,
  marketing, and unknown events retain only classified receipt metadata; no
  irrelevant customer payload is stored.

```text
command: Contracts test/typecheck/lint; API Cents adapter and HMAC suites
exit: 0
time: 2026-07-12T12:22:50-04:00
summary: 30 contract tests and 41 API Cents/security tests passed, including malformed variants, money normalization, signature mutation, clock bounds, key rotation, ignored events, duplicates, and redaction.
```

## T3 — Location and intake truth

Status: committed

- Store mapping, CRM and production order projection, configs, shifts, plans,
  runs, batches, stages, machine assignments, and work events are explicitly
  location-owned.
- Source ordering uses `updatedAt`; stale delivery is ignored and equal-time
  divergence is visible. Missing bag count projects as `intake_pending` and is
  excluded from scheduling until operator intake records provenance and version.
- Upgrade migrations quarantine legacy rows instead of assigning them to a real
  facility, and the full location closure is enforced with composite keys.

```text
command: DB unit and role/persistence integration; Production unit/type/integration; migration-backed cross-location tests
exit: 0
time: 2026-07-12T12:25:31-04:00
summary: 9 DB unit, 24 DB integration, 41 Production unit, and location/intake Postgres integration proofs passed on the isolated test database.
```

## T4 — Operator capabilities and resumability

Status: committed

- Authenticated reads discover only allowed locations, expose honest
  intake-pending order state, and restore the current location workspace after a
  process or browser restart.
- Versioned intake is idempotent, policy-gated, location-scoped, and updates bag
  rows plus its work event in one transaction.
- The operator-owned resource bootstrap defaults to dry-run, validates one
  versioned JSON manifest, converges on natural keys, rejects destructive
  inventory changes, and records applied outcomes. No facility facts are seeded
  in runtime code.
- Global dead-receipt recovery exposes minimized metadata and hard-confirmed,
  single-receipt replay through the same projection use case; repeat after a
  lost response is idempotent.

```text
command: Contracts, Production, Access Control, Auth, API bootstrap, architecture, and focused Postgres bootstrap/recovery proofs
exit: 0
time: 2026-07-12T12:34:18-04:00
summary: 30 contract, 41 Production unit, 22 Access Control, 95 Auth, 3 API bootstrap, 2 bootstrap/recovery Postgres, and 53 architecture-boundary tests passed; the example bootstrap manifest validates.
```

## T6 — Worker observability and recovery

Status: committed

- The private Worker now uses structured redacting logs, the existing incident
  reporter, throttled counters/measurements, bounded loop backoff, lease
  recovery signals, retry/dead-letter signals, processing latency, backlog age,
  fatal reporting, and graceful shutdown.
- A private file heartbeat makes a stalled loop unhealthy without adding a
  Worker route or public port. Production startup rejects disabled jobs or a
  missing incident destination.
- Reconciliation is explicitly `manual_replay_only` until Cents verifies an
  authoritative read API. Global authorized operators can inspect minimized
  dead metadata and replay one confirmed receipt through the normal projection
  use case; no row is projected by direct mutation.

```text
command: pnpm test:lpms:int; Worker test/typecheck/lint/build; Logging and architecture tests
exit: 0
time: 2026-07-12T12:41:31-04:00
summary: 92 LPMS integration/unit/asset tests passed across 25 files, including 24 DB, 2 Worker Postgres, 13 Worker unit, 5 Production Postgres, 42 Production unit, and 6 webhook-asset tests; Worker build and static gates passed.
```

## T5 — Authenticated, live-only Processor

Status: committed

- The Processor reuses the existing opaque server-side session authority through
  a production `Secure`, `HttpOnly`, `SameSite=Strict`, host-only cookie. MFA
  challenges use a separate short-lived cookie; no bearer credential is exposed
  to browser storage.
- Unsafe cookie-authenticated requests require an exact trusted origin and a
  session-bound HMAC CSRF token held only in JavaScript memory. Existing bearer
  clients remain supported at the API boundary.
- Runtime demo switching, fixtures, hardcoded location/date facts, and unstable
  timestamp/random idempotency keys were removed. The application discovers the
  operator's allowed locations, restores the current workspace, records intake,
  schedules current work, and assigns machines through live contracts.
- Loading, empty, expired-session, MFA, forbidden, conflict, offline, retry, and
  no-active-run states use the existing light/dark design system.

```text
command: Contracts, Auth, API, Processor, architecture, source-residue, and diff gates
exit: 0
time: 2026-07-12T12:49:44-04:00
summary: 32 contract, 95 Auth, 100 API, 27 Processor, and 53 architecture-boundary tests passed with typecheck, lint, and production builds; demo/location/date/live-switch and unsafe-idempotency residue checks were empty.
```

## T7 — Signed ingress and production-like proof assets

Status: committed

- A secret-free Postman collection computes the exact timestamped HMAC over the
  raw request body and covers valid, duplicate, wrong-key, mutated-body, stale,
  order, customer, and marketing deliveries. The automated composed proof adds
  unknown-store and intake-pending behavior.
- The runbook names only placeholders and records the same no-secret evidence
  discipline as the work network.
- The end-to-end gate first runs the real Cents wire and HMAC boundary suites,
  then its application-composed happy path verifies duplicate and out-of-order
  behavior, records missing intake, and proves the exact 800-pound fixed-pulse
  schedule across all four stages.

```text
command: pnpm test:lpms:int; pnpm test:lpms:e2e
exit: 0
time: 2026-07-12T12:49:44-04:00
summary: 92 LPMS integration/unit/asset tests and the composed API plus Processor happy-path suites passed; all Postman assets parse and contain no committed secret or customer fixture.
```

## V1 — Local production-readiness proof

Status: committed

- Exact-byte ingress, minimized durable rows, location closure, intake truth,
  Processor cookie/CSRF behavior, Worker recovery, and the fixed-pulse happy path
  pass their focused, HTTP, migration-backed, architecture, and composed tests.
- The persisted-row assertions prove ignored customer events keep no canonical
  payload or payload hash, while security tests prove raw bodies, signatures,
  signing keys, and synthetic customer details do not enter responses or logs.
- Vendor reconciliation remains deliberately unsupported and externally gated;
  production recovery is `manual_replay_only` until Cents confirms an
  authoritative read API.

```text
command: pnpm format:check; pnpm lint; pnpm typecheck; pnpm test; pnpm build
exit: 0
time: 2026-07-12T13:12:51-04:00
summary: formatting passed; 23/23 lint tasks, 41/41 typecheck tasks, 551 workspace tests plus 131 tooling tests (682 total), and 23/23 build tasks passed. The Processor retained a non-failing 502.40 kB chunk warning and Web retained its pre-existing Sentry navigation-instrumentation warning.
```

```text
command: pnpm test:lpms:int; pnpm test:lpms:e2e
exit: 0
time: 2026-07-12T13:14:31-04:00
summary: 92 LPMS integration/unit/asset tests and 69 composed API/Processor tests passed against isolated synthetic data, including 24 DB, 2 Worker Postgres, 13 Worker unit, 5 Production Postgres, 42 Production unit, 6 webhook-asset, 42 signed-ingress/API, and 27 Processor tests.
```

```text
command: pnpm docker:lpms:build; docker compose config; git diff --check
exit: 0
time: 2026-07-12T13:17:27-04:00
summary: API, Worker, and Processor local images built from their Dockerfiles; the local development topology rendered successfully; and the dirty-tree patch contains no whitespace errors.
```

```text
command: pnpm stateworks:memory:validate stateworks/memory/domains/laundry-production/memory.yaml; pnpm stateworks:validate stateworks/work/active/lpms-production-readiness/network.yaml; pnpm stateworks:verify stateworks/work/active/lpms-production-readiness/network.yaml --state stateworks/work/active/lpms-production-readiness/state.yaml
exit: 0
time: 2026-07-12T13:17:27-04:00
summary: memory v4 and the 25-task network validate; the lifecycle advances to T8 with no verifier failure.
```

The independent acceptance audit subsequently invalidated this pass: it found
uncovered cross-command idempotency collisions, a Processor adapter that
fabricated stage-fit assertions, and an unusable legacy rollback target for the
first four-image cutover. V1 was reopened at 2026-07-12T13:20:00-04:00 and will
not advance until those findings are repaired and the exact gate is rerun.

### Acceptance-audit repair

- Production idempotency now binds a key to the complete canonical command
  identity across every write and replays the original result only for an exact
  match.
- Cents projection, receipt completion, and schedule acceptance are row-locked,
  versioned, lease-fenced, and snapshot-validated. Concurrent intake and
  priority facts cannot be overwritten; stale Worker ownership rolls back the
  projection transaction; committed production work rejects later vendor
  mutation with a stable recoverable error.
- Stage completion now enforces a full pulse from the actual start, and folding
  completion atomically terminalizes assignments, order, bags, active links,
  batch, run, and shift with affected-row assertions.
- Stage-fit assertions remain explicit operator-owned configuration inputs and
  are never fabricated by schedule computation. Workspace refresh uses
  generation fencing so an older success or error cannot overwrite newer
  same-location or cross-location state.
- Invalid Cents authentication emits a redacted security event and counter.
  Worker signals export through Sentry Metrics and a Cron heartbeat while
  retaining the private file health check.
- Four-image deploy and rollback use one strict release identity, snapshot the
  active release before mutation, verify image revision labels before migration,
  and retain an explicit first-cutover bridge to the legacy two-image checkout.

```text
command: pnpm format:check; pnpm lint; pnpm typecheck; pnpm test; pnpm build
exit: 0
time: 2026-07-12T14:01:30-04:00
summary: formatting passed; 23/23 lint tasks, 41/41 typecheck tasks, 576 workspace tests plus 145 tooling tests (721 total), and 23/23 build tasks passed on the repaired tree. Processor emitted a non-failing 503.34 kB chunk warning and Web retained its pre-existing Sentry navigation-instrumentation warning.
```

```text
command: pnpm test:lpms:int; pnpm test:lpms:e2e
exit: 0
time: 2026-07-12T14:01:52-04:00
summary: 114 LPMS integration/unit/asset tests passed (24 DB, 3 Worker Postgres, 20 Worker unit, 9 Production Postgres, 52 Production unit, 6 webhook assets); 73 composed tests passed (42 signed-ingress/API and 31 Processor), including the deferred stale-workspace proof.
```

```text
command: pnpm docker:lpms:build; docker compose config; git diff --check
exit: 0
time: 2026-07-12T14:02:20-04:00
summary: API, Worker, and Processor images rebuilt from the repaired tree; the local topology rendered; and the full patch retained clean whitespace.
```

```text
command: independent read-only acceptance audits; Stateworks network and memory validation
exit: 0
time: 2026-07-12T14:03:10-04:00
summary: no release-blocking finding remains across consistency, pulse semantics, Processor freshness, HMAC visibility, CI, deploy, or rollback; memory v4 and the 25-task network validate. Live vendor, cloud, alert-routing, deployment, and pilot claims remain explicit human gates.
```

## T8 — Four-image CI and immutable release identity

Status: committed

- Branch CI remains build-only. Main CI is configured to build API, Web,
  Worker, and Processor from one source SHA, generate four SPDX SBOMs, run the
  critical vulnerability gate on every image, and push only after all scans
  succeed.
- The release manifest accepts exactly four distinct digest-qualified images
  and one full source SHA. Missing images, mutable tags, malformed digests,
  wrong application repositories, shared digests, extra fields, or a mismatched
  source SHA fail validation.
- This is repository and local workflow-equivalent proof only. No image was
  published and no remote GitHub Actions run is claimed.

```text
command: release-manifest tests; full tooling tests; in-memory four-image manifest create/validate; actionlint availability check; git diff --check
exit: 0
time: 2026-07-12T14:04:14-04:00
summary: 20 release-manifest tests and all 145 tooling tests passed; a synthetic four-digest manifest round-tripped against its full source SHA. actionlint is unavailable locally, so pinned workflow structure is covered by repository tests.
```

## T9 — Production topology, deploy, and rollback

Status: committed

- Production Compose runs API, Web, Worker, Processor, Postgres, and Caddy on
  private networks; only Caddy publishes host ports. Processor uses same-origin
  `/api`, and Worker exposes no HTTP surface.
- Deploy preflight is non-mutating and verifies required tools, Compose v2,
  target checkout SHA, four distinct immutable images, current metadata,
  mode-`0600` env files, and rendered Compose. Before migration, all selected
  application images must carry the target source revision label.
- Release metadata is snapshotted atomically before mutation. A failed upgrade
  restores the actual active release, while the first four-image cutover has an
  explicit legacy two-image checkout bridge rather than an unusable partial
  manifest.
- Production binary compatibility with a future forward-migrated database is
  not claimed here; that remains the `H3` release approval obligation.

```text
command: deployment/topology tests; production Compose render and port assertion; Caddy adapt/validate; Bash syntax; shellcheck availability; git diff --check
exit: 0
time: 2026-07-12T14:05:00-04:00
summary: 19 focused deployment/topology tests passed; the production configuration rendered with only Caddy publishing 80/443; Caddy validated; deploy, rollback, backup, and role scripts passed Bash syntax. shellcheck is unavailable locally and its behavioral obligations are covered by tooling tests.
```

## V2 — Offline production-topology proof

Status: committed

- The safety harness accepted only the local Unix Docker context, created a
  unique disposable project, bound its only ingress to loopback HTTPS, generated
  random local credentials, and refused pre-existing project resources or image
  names.
- All four production Dockerfiles built. A clean Postgres volume migrated with
  zero runtime demand, then an explicit synthetic facility and owner were
  bootstrapped through supported command boundaries.
- Caddy served Web, API, and Processor routes while Worker and Postgres remained
  private. Processor login established a Secure, HttpOnly, SameSite=Strict,
  host-only cookie; session restore, missing-CSRF rejection, valid-CSRF logout,
  and revoked-session rejection all passed.
- One exact-byte HMAC-signed Cents order was accepted and projected by Worker as
  one `intake_pending` production order. API restart remained healthy and Worker
  restart advanced its heartbeat.
- All four applications switched from synthetic release A to B and rolled back
  to A while preserving exactly one receipt and one projected order. Both local
  release tags use the same current-tree binaries, so historical binary/database
  compatibility is explicitly not proven.
- One six-container steady-state snapshot measured `302021345` bytes, or `7.03%`
  of the 4 GiB pilot floor, leaving `92.97%` observed headroom. This is a single
  local snapshot, not a production sizing or capacity guarantee.
- Teardown succeeded and an independent follow-up found zero project containers,
  networks, or volumes. The redacted transient report is
  `/tmp/pressly-v2-smoke-1000-96131-report.json`.

```text
command: pnpm docker:production:smoke; independent report assertions and Docker resource query; git diff --check
exit: 0
time: 2026-07-12T14:08:30-04:00
summary: clean migration/bootstrap, loopback HTTPS routes, Processor cookie/CSRF flow, signed webhook-to-Worker projection, API/Worker restart, A-to-B-to-A four-image selection, 1/1 durable row counts, memory snapshot, and zero-resource teardown all passed. No production, Cents, DNS, cloud, or deployed endpoint was contacted.
```

Automatic vendor reconciliation remains unsupported because Cents has not
confirmed an authoritative updated-orders read API. Recovery therefore remains
authorized manual replay, and the work stops at `H1` rather than claiming that
external behavior.

## R1 — Generic ingestion and source-neutral Production

Status: committed

- `modules/integration/webhook-ingestion` now owns the generic durable event
  lifecycle: deduplication, claims, expiring leases, retry/dead-letter
  completion, replay, backlog measurement, and source-location bindings.
- `apps/api/src/vendors/cents` owns exact-byte Cents HMAC verification and wire
  normalization. The generic ingestion module receives only the normalized
  event command.
- `apps/worker` is the asynchronous composition root. Its declarative
  `source:subjectType` dispatcher selects the Cents order consumer, which
  resolves the source-location binding, derives an estimated weight, maps the
  source status, and calls Production's canonical `ApplyOrderDemand` command.
- Production owns `order_demands`, production planning, and physical execution.
  Its source has no Cents, webhook, receipt, lease, or CRM vocabulary. The
  repository architecture test now enforces both this lexical boundary and the
  existing no-module-to-module dependency rule.
- Production and inbox completion remain separate module-owned transactions.
  Stable `webhook:<event-id>` Production idempotency makes crash-after-commit
  redelivery a no-op before lease-fenced inbox completion.
- Migration `0015_lpms-module-boundaries` preserves existing rows while
  generalizing `webhook_events`, `source_location_bindings`, `order_demands`,
  and the Production foreign key. Its Drizzle snapshot now represents the
  post-migration schema rather than the pre-refactor schema.
- Contracts, bootstrap fixtures, Postman/runbook wording, Docker dependency
  layers, canonical architecture/LPMS docs, and Stateworks all describe the new
  boundary. Empty deleted Production feature and test directories were removed.

```text
command: focused contracts, architecture, webhook-ingestion, Production, Worker, API, and Processor tests
exit: 0
time: 2026-07-12T15:42:23-04:00
summary: 55 architecture-boundary tests, 36 contracts tests, 7 generic ingestion unit tests, 46 Production unit tests, 21 Worker tests, 102 API tests, and 31 Processor tests passed. The Docker-manifest rail caught and then permanently covers new module manifests in cached API/Worker dependency layers.
```

```text
command: fresh disposable test database; pnpm test:lpms:int; pnpm test:lpms:e2e
exit: 0
time: 2026-07-12T15:40:53-04:00
summary: all 15 migrations applied from zero; 25 DB, 3 generic inbox Postgres, 7 generic inbox unit, 21 Worker, 4 Production Postgres, 46 Production unit, and 6 webhook-asset tests passed. The composed gate then passed 42 signed-ingress/API and 31 Processor tests.
```

## RV1 — Post-refactor acceptance proof

Status: committed

- The full repository static and behavioral gates pass after the boundary
  refactor. The only repair during acceptance was changing a Processor test
  fixture from source-specific `cents` bag provenance to
  `external_source`; no runtime demo data was introduced.
- API, Worker, and Processor images build with the new workspace module. A
  dynamic architecture test prevents a future module from being omitted from
  API/Worker cached Docker installs.
- The isolated production topology migrated a clean volume, applied the
  source-neutral bootstrap manifest, authenticated through Caddy, accepted one
  exact-byte signed Cents event, and reached exactly one `intake_pending`
  Production order through the generic inbox and Worker adapter.
- Independent API and Worker restarts recovered. Synthetic release A-to-B and
  rollback B-to-A preserved exactly one ingested event and one Production
  order. Teardown left zero project containers, networks, or volumes.
- One six-container steady-state snapshot measured `304139469` bytes, or
  `7.08%` of the 4 GiB pilot floor, leaving `92.92%` observed headroom. This is
  a local snapshot, not a production sizing guarantee.

```text
command: pnpm format:check; pnpm lint; pnpm typecheck; pnpm test; pnpm build
exit: 0
time: 2026-07-12T15:40:28-04:00
summary: formatting passed; 24/24 lint tasks, 43/43 typecheck tasks, 583 workspace tests plus 147 tooling tests (730 total), and 24/24 build tasks passed. Processor retained its non-failing 508.22 kB chunk warning and Web retained its pre-existing Sentry navigation-instrumentation warning.
```

```text
command: pnpm docker:lpms:build; pnpm docker:production:smoke
exit: 0
time: 2026-07-12T15:47:28-04:00
summary: API, Worker, and Processor images built; the six-container private topology passed clean migration/bootstrap, loopback HTTPS, Processor cookie/CSRF, signed event-to-Production, independent restarts, A-to-B-to-A release selection, exact 1/1 durable row preservation, memory measurement, and zero-resource teardown. No production, Cents, DNS, cloud, or deployed endpoint was contacted.
```

The refactor proof supersedes historical V2 for repository behavior. Work may
return to `H1`; live vendor contract, cloud, secret placement, alert routing,
deployment, and pilot claims remain explicit human gates.

## 2026-07-14 — Run-centered scheduling implementation proof

Status: reference appended; `H1` remains the current human gate

The affected local/RV1 repository and disposable-topology proof was rerun after
`lpms-run-centered-online-scheduling`. The canonical evidence is
`stateworks/work/done/lpms-run-centered-online-scheduling/evidence.md`; its
terminal summary is
`stateworks/work/done/lpms-run-centered-online-scheduling/final-report.md`.

Root typecheck (43/43), lint (24/24), tests (149 files/814 tests), and build
(24/24) passed. The canonical LPMS integration gate passed 36 files/153 tests,
and the LPMS end-to-end gate passed 13 files/86 tests. The disposable Docker
proof completed two signed synthetic Cents orders in one production run through
automatic placement, explicit freeze, run-ID resume, all four stages, rollback,
durability, and zero-resource teardown.

This appended proof updates repository behavior only. It does not rewrite the
historical V2/RV1 evidence above and does not claim or advance the live Cents
contract, cloud, secret placement, alert routing, deployment, or pilot gates.
Work remains stopped at `H1` under `human-actions.md`.

## 2026-07-15 — Operator workspace and live synchronization checkpoint

Status: reference appended; `H1` remains the current human gate

The verified repository checkpoint is recorded in
`stateworks/work/done/lpms-operator-workspace-live-sync/evidence.md`; its
terminal summary is
`stateworks/work/done/lpms-operator-workspace-live-sync/final-report.md`.

It covers versioned pre-start shift and folder changes, run-provenance-aware
history, explicit early-completion confirmation, atomic final run/shift closure,
resource routes without automatic invalid-path redirects, authenticated SSE
invalidation with authoritative reload, and the intentionally separate Worker
inbox claim loop. Focused, isolated migration/integration, LPMS end-to-end,
root, Stateworks, and read-only local-runtime checks passed. Laundry-production
memory advanced from v6 to v7.

The runtime snapshot preserved the active synthetic run and its 15 scheduled
orders totaling 800.000 pounds and 34 bags; no production command was issued.
This checkpoint does not establish live Cents, cloud, secret placement, alert
routing, deployment, or pilot facts and therefore does not advance `H1`.

## 2026-07-17 — Documented Cents unsigned compatibility

Status: repository verified; not deployed

- Steven explicitly authorized temporary unsigned compatibility with Cents'
  documented HTTPS JSON webhook so launch does not depend on an undocumented
  signing contract.
- `CENTS_WEBHOOK_AUTH_MODE` now selects `hmac` or `unsigned`. HMAC remains the
  default and retains exact-byte verification; unsigned mode skips only source
  authentication and emits a redacted startup warning.
- The documented unsigned order payload reached the same normalization and
  durable inbox boundary and returned HTTP 202. JSON content type, 256 KB body
  limit, validation, minimized persistence, source ordering, store binding,
  and idempotency remain unchanged.
- Canonical architecture, LPMS, operations, AWS environment examples, and this
  active readiness package now distinguish configured ingress from proven
  authenticity. Historical signed-ingress evidence above remains unchanged.

```text
command: pnpm --filter @pressly/api test; pnpm --filter @pressly/api typecheck; pnpm --filter @pressly/api lint
exit: 0
time: 2026-07-17T13:56:30-04:00
summary: 14 API test files and 120 tests passed, including unsigned documented-payload HTTP 202 and durable receipt coverage; API source and test typechecks passed; API lint passed with zero warnings.
```

```text
command: pnpm exec vitest run tooling/test/architecture-boundaries.test.mjs; pnpm stateworks:validate stateworks/work/active/lpms-production-readiness/network.yaml; git diff --check
exit: 0
time: 2026-07-17T13:56:32-04:00
summary: 60 architecture tests passed, the 27-task readiness network validated, and the working-tree diff contained no whitespace errors. No production endpoint, AWS host, Cents account, secret, or customer payload was touched.
```

## 2026-07-19 — Cents intake hardening authorized

Status: repository and local runtime verified; not deployed

- The current Cents article and production receipts were rechecked. Successful
  order status is copied from `order.status`; Pressly does not translate
  `IN_PROGRESS` into `SUBMITTED`.
- Steven approved three bounded repairs before deployment: retain valid
  unweighed demand with a missing estimate, recover historical lifecycle and
  weight from the latest canonical receipt, and add encrypted short-retention
  raw quarantine plus rejection observability.
- The canonical `webhook_events.payload_json` remains minimized worker input.
  Raw receipt data remains outside Production, public APIs, Processor, logs,
  Sentry, fixtures, and durable Stateworks evidence.

### Implemented boundary

- The Cents Worker now represents zero or non-calculable pre-weigh pricing as
  a missing estimate. Production persists the advisory `order_demand` without
  creating executable floor work; a strictly newer positive estimate admits
  the existing demand through the normal policy.
- Migration `0021_lpms-demand-lifecycle-outlook` backfills the latest processed
  canonical Cents phase, source status, and positive calculable estimate before
  enforcing the new constraints. Legacy Production weight remains the final
  authority for already-created production work.
- Migration `0022_cents-webhook-quarantine` adds a source-neutral diagnostic
  receipt table. The Cents API boundary encrypts exact valid-JSON raw bytes in
  a versioned AES-256-GCM envelope, records accepted or rejected normalization,
  links accepted receipts to the canonical inbox event, and retains them for
  30 days by default. No public retrieval route was added.
- Worker maintenance purges expired quarantine receipts on the bounded backlog
  sampling cadence. API rejection counters contain only source, safe reason
  code, and HTTP status.
- Production startup now requires a distinct 32-byte base64
  `CENTS_WEBHOOK_QUARANTINE_ENCRYPTION_KEY`; the retention may be configured
  with `CENTS_WEBHOOK_QUARANTINE_RETENTION_DAYS` from 1 through 90. The key may
  not reuse MFA key material.

```text
command: pnpm test:lpms:int
exit: 0
time: 2026-07-19T11:25:49-04:00
summary: all 22 migrations applied; 47 database integration/schema tests, 5 quarantine/inbox repository tests, 11 ingestion unit tests, 33 Worker tests, 19 Production repository tests, 105 Production unit tests, and 6 Cents asset tests passed. The historical Cents lifecycle/weight migration and encrypted quarantine repository both ran against isolated Postgres roles.
```

```text
command: focused typecheck and lint; pnpm --filter @pressly/api test; pnpm format:check; architecture boundaries; Stateworks validation; git diff --check
exit: 0
time: 2026-07-19T11:33:50-04:00
summary: affected API, Worker, Production, policy, ingestion, database, metrics, and contract boundaries typechecked and linted; all 126 API tests and 58 architecture tests passed; repository formatting, the 27-task readiness network, and whitespace checks passed.
```

```text
command: rebuilt local API and Worker; signed documented-shape synthetic webhook plus valid-JSON normalization rejection; read-only SQL verification
exit: 0
time: 2026-07-19T11:31:00-04:00
summary: the zero-price SUBMITTED order returned 202, reached processed demand phase expected with no estimate and no production_order, and linked to a versioned encrypted receipt with exactly 30-day retention. The malformed order returned 400 and retained an encrypted rejected receipt with invalid_cents_order_payload and no canonical event. No raw payload, key, customer data, production endpoint, AWS host, or Cents account was exposed or contacted.
```

## 2026-07-26 Repository-Proof Rebaseline

The completed `lpms-operational-authority-remaining-day-forecast` package
changed source handoff, Orders and Production lifecycle ownership,
production-order execution persistence, forecast contracts, Home, Schedule,
Production, Intake, and History assumptions after the prior readiness proof.

The historical commands and results below remain valid evidence for their
recorded revision. At this checkpoint, V2 was invalidated for the then-current
worktree. Both `lpms-order-control-correctness-hardening` and
`lpms-production-order-resolution-and-identity` later completed; the
2026-08-08 current five-image V2 reproof below supersedes this temporary
invalidation.

H1 and later live-vendor, deployment, production-data, and pilot gates remain
stopped. No live external state was changed.

## 2026-08-08 - Current five-image V2 reproof

Status: committed.

The application and release checkout under this proof was exact source commit
`a5c768b97cc9dee56bb53de1678563849b6d1f9a`; the only working-tree differences
during the proof were these Stateworks truth records, not executable
application or release inputs. The proof includes the completed
operational-authority, order-control, production-order-resolution, and
exact-raw-redelivery work. The exact-redelivery repair is recorded canonically in
`stateworks/work/done/cents-webhook-redelivery-idempotency/` and was merged at
exact source commit `8dec29e0724ea05340a2586a348991f256c06d81`.

```text
main CI: 31275127116, success
CodeQL: 31275126925, success
production deployment: 31276572639, success
time: 2026-08-08
summary: protected-main CI, CodeQL, and the normal production deployment succeeded for the exact Cents repair SHA. This proves publication and deployment, not that a historical real Cents redelivery has traversed the repaired path.
```

```text
command: pnpm test:lpms:int
exit: 0
time: 2026-08-08
summary: 178 files and 750 tests passed across the database, Users, Orders, webhook-ingestion, Worker, Production, and final LPMS asset suites. The complete webhook-ingestion PostgreSQL and unit suites include the exact-raw-redelivery regression.
```

```text
command: pnpm test:lpms:e2e
exit: 0
time: 2026-08-08
summary: the composed API proof passed 5 files and 55 tests; Processor passed 40 files and 275 tests. Two existing Radix Dialog description warnings remained non-failing test output.
```

```text
command: pnpm docker:production:smoke; inspect the redacted report; query disposable Docker resources after teardown
exit: 0
time: 2026-08-08T16:48:35-04:00
summary: all five application images built. The seven-container topology migrated a clean database, exposed only loopback Caddy, proved Web/API/Processor/Control routes, Processor MFA/cookie/CSRF behavior, two signed submitted candidates through acceptance, fulfillment release, intake, scheduling, one completed run and four completed stages, independent API and Worker recovery, and five-image A-to-B-to-A release rotation with durable state preserved. The steady-state snapshot measured 450615050 bytes, 10.49% of the historical 4 GiB floor, with 89.51% observed headroom. Teardown left zero owned containers, networks, volumes, or images. The redacted transient report is /tmp/pressly-v2-smoke-1000-1060023-report.json; no production, Cents, DNS, or deployed cloud endpoint was intentionally contacted.
```

A follow-up review corrected only the report field names from the retired
four-image wording to `switchedAllFiveToReleaseB` and
`rolledBackAllFiveToReleaseA`. The complete disposable smoke reran successfully
at 2026-08-08T17:17:08-04:00: both fields were true, both release manifests
contained API, Web, Worker, Processor, and Control, and teardown again left zero
owned containers, networks, volumes, or images. That verifier-only follow-up
does not rebind the current V2 application/release proof from exact checkout
`a5c768b97cc9dee56bb53de1678563849b6d1f9a`.

This current reproof repairs the temporary 2026-07-26 V2 invalidation. At that
checkpoint it did not advance H1 or any later live-vendor, production-data,
pilot, or recovery gate; the natural backup, independent immutable custody,
approved RPO/RTO, off-host escrow, and replacement-instance drill were still
open under `production-recovery-hardening`. The operational rebaseline below
supersedes only those later dated facts and does not rewrite this repository
proof.

## 2026-08-09 - Current production operations rebaseline

This operational evidence does not rebind the current application/release V2
proof from exact checkout
`a5c768b97cc9dee56bb53de1678563849b6d1f9a` and does not advance the ordered
live-vendor gates.

Exact source `d7dde6755b7d8c09b81692384a546172fa2651f0` passed CodeQL run
`31285810375`, main CI `31285810370`, immutable artifact publication, strict
required job `93177475707`, and production deployment `31286982819`. The
release artifact contained the exact source plus five expected distinct GHCR
repository/digest identities. Pinned host readback matched release pointers,
verified state, repository HEAD, operations source, and all five application
revisions and digests. All seven services were running, the six defined
container health checks were healthy, Caddy was running, and the four public
health authorities returned HTTP 200.

That exact operations payload dispatched the first natural approved hourly
backup at 01:15 UTC. One encrypted dump, checksum, and metadata triplet reached
both the primary and independent secondary destination under six non-null
VersionIds. Each current-object GET was bracketed before and after by the same
non-null immutable VersionId and matched the local size and encrypted-byte hash;
no version-pinned GET is claimed. All six objects reported `AES256`, the private
local authority was mode `0600`, and Sentry recorded a distinct natural `ok`
check-in. Post-run readback found no process, lock, or restore journal. All seven
services were running, the six defined container health checks were healthy,
Caddy was running, and all four public health authorities returned HTTP 200.
The exact object evidence and remaining custody gates are owned by
`production-recovery-hardening`, where `V2` is now committed.

Exact source `bc0987b98f746cab5d2a97f91c5e3f7892561bb6` then passed CodeQL run
`31288031106`, main CI `31288031209`, strict required job `93183226933`, and
production deployment `31289140630`. Both deployment-monitor workflow steps
succeeded. Sentry check-in `7c2f04ab-fca1-412c-af46-9578354e32a0` moved from
`in_progress` to `ok` under the same identifier after 57.631 seconds. The
production deployment monitor remains active, team-owned, unmuted, and routed
through its intact detector/workflow. Pinned host readback matched every release
authority and operations checksum to `bc098`, preserved exactly one hourly
backup entry with its secondary and Sentry bindings, and found all seven
containers running with zero restarts. The six defined container health checks
were healthy, Caddy was running, and API, Web, Processor, and Control returned
HTTP 200.

The next natural 02:15 UTC backup under exact `bc098` also completed with a
distinct encrypted triplet and Sentry `ok` check-in. Its dump size and hash plus
the checksum and metadata authorities validated, the cron hash remained
unchanged, no backup process or restore journal remained, all seven containers
were running, the six defined health checks were healthy, Caddy was running,
and all four public and pinned health authorities returned HTTP 200. This proves
the deployment preserved natural scheduling without advancing `H2D` or the
remaining recovery gates.

Independent recovery-account readback subsequently proved that the three exact
current versions of the manual secondary triplet use SSE-S3 and 90-day Object
Lock `COMPLIANCE` retention through
`2026-11-07T00:56:17Z`/`18Z`/`19Z`. Their VersionIds and exact sizes agree with
the upload/readback and restore-preflight evidence. This closes the retention
portion of recovery `H2`; that gate remains pending on the complete off-host
recovery-material inventory and redacted escrow retrieval. `H3` and `V3` remain
open behind it.

These successful check-ins prove execution and Sentry ingestion, not
operator-notification delivery or recovery. No bounded failure/recovery signal
was delivered to and acknowledged by the operator, so `H2D` is not advanced.
The Control `API-E` issue also remains open under
`pressly-control-workforce-identity`: its focused projection repair has no
recurrence, but no authenticated production Order-detail read has yet exercised
the repaired path.
