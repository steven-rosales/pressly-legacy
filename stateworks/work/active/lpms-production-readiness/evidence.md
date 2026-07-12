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
- Processor stage-fit assertions are explicit operator inputs. Workspace refresh
  uses generation fencing so an older success or error cannot overwrite newer
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

- `modules/business/webhook-ingestion` now owns the generic durable event
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
