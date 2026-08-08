# LPMS Production Readiness

## Status

Active. This work started after the locally verified LPMS v1 happy path.

The purpose is to replace the remaining demo and unverified-vendor seams with
one deployable, observable production path. Cents ingress uses an explicit
runtime authentication mode; the initial documented-vendor compatibility mode
is intentionally unsigned. This work does not add the deferred exception
workflows.

## Outcome

An authorized Pressly operator can:

1. Sign in to the processor with the existing opaque server-side session and
   MFA flow.
2. Select an actual location and resume its current production workspace.
3. Receive a Cents order event through the configured ingress mode, ingest it
   durably, retain it through a Worker-owned adapter as an Orders observation,
   use an explicit Pressly command and the Orders fulfillment-release graph to
   admit canonical demand, project that demand through the Orders outbox, record
   physical bag count through versioned operator intake, and see the order
   become schedulable only when all required facts exist.
4. Create and accept a deterministic schedule, then operate the four fixed
   stages through the processor.
5. Detect and recover from webhook duplicates, stale delivery, worker retries,
   dead letters, restarts, and a missed vendor delivery when the vendor exposes
   a reconciliation API.

The production release contains five immutable application images: `api`,
`web`, `worker`, `processor`, and `control`. Caddy is the only public ingress.
The worker is a separate private long-lived container because its lifecycle,
retry, and failure behavior differ from the API.

The committed four-image release tasks and their evidence below describe the
historical pre-Control release boundary. They remain dated evidence rather than
current topology. Current deployment and recovery work must prove all five
application images. The dedicated
`stateworks/work/active/production-recovery-hardening/` package owns the
post-deployment rollback, restore, backup-monitoring, immutable-custody, and
replacement-instance gates; this pilot remains stopped while those gates are
open.

## Historical Verified Starting Point (Superseded)

The following bullets were the verified input baseline when this work package
was created. They are retained as dated delivery evidence and must not be read
as current repository claims:

- `stateworks/work/done/lpms-v1-happy-path/` proved the local deterministic
  happy path.
- The API composed production business, policy, scheduling, access control, and
  persistence boundaries.
- The webhook route was `/webhooks/cents`, but live verification failed closed
  and the internal Cents contract was synthetic rather than the documented wire
  payload.
- The processor defaulted to a `?live=1` opt-in and otherwise used hardcoded
  demo orders, dates, location, proposal, and board state from `src/`.
- The worker had durable leases, retries, and dead-letter behavior, but its
  runtime used null logging and metric sinks and did not schedule
  reconciliation.
- Local Compose contained the worker and processor. Production Compose, release
  manifests, deploy, rollback, and public routing contained only API and Web.
- Production location, Cents-store mapping, station, machine, and initial
  scheduler configuration were not bootstrapped through an operator-owned
  idempotent procedure.

T0 re-checks and later validation evidence, not this superseded baseline, decide
the current repository state.

## Current Module Boundary

The post-V2 refactor adds a deliberate change-control pair, `R1 -> RV1`, before
the first external gate:

- `modules/integration/webhook-ingestion` owns generic durable inbox lifecycle,
  dead letters, replay, and source-location bindings.
- `apps/api/src/http/webhooks/cents` owns Cents authentication and wire
  normalization.
- `apps/worker` owns the `source:subjectType` consumer registry, composes webhook
  ingestion with Orders observation capabilities, and separately projects the
  Orders outbox into Production.
- `modules/business/orders` retains typed external observations, applies
  claim-scoped source authority only to non-lifecycle fields, owns explicit
  commercial and fulfillment-release commands backed by directed graphs, and
  emits versioned `fulfillment_demand_changed` outbox events.
- `modules/business/production` accepts a canonical
  `ApplyFulfillmentDemand` projection and contains no Cents, webhook, receipt,
  lease, or CRM language. It owns physical bag count through versioned operator
  intake.
- Stable source-revision handling closes the crash window between Orders
  observation and inbox completion. Stable `order-outbox:<event-id>`
  idempotency separately closes the crash window between Production projection
  and outbox completion without coupling module transactions.

Historical V2 evidence remains useful but does not prove this new boundary.
RV1 must rerun repository, database, integration, and isolated Docker-topology
proof before work returns to H1.

## Order Authority Rebaseline - 2026-07-28

`pressly-order-authority-source-autonomy` has completed repository and local
runtime verification. The production-readiness path now assumes the following
implemented boundary:

- external adapters submit observations and cannot emit canonical lifecycle,
  fulfillment-release, physical-intake, Production-resolution, or other
  operational commands;
- Orders evaluates every valid newer observation against a versioned
  Pressly-owned capability profile, exact claim and lifecycle phase, field
  authority, and a persistent source-and-location posture;
- missing or contradictory authority evidence fails closed while retaining the
  observation and its append-only decision record;
- canonical commercial and fulfillment transitions use explicit Pressly
  commands and the owning directed graphs;
- Worker projects only committed source-neutral canonical fulfillment demand
  to Production;
- Production ignores external bag data and remains the only owner of physical
  intake and floor lifecycles; and
- Processor action availability, source context, versions, and denial reasons
  are composed on the server.

The completed local proof does not satisfy `RV1` or `H1`. Production readiness
must still verify the real Cents contract, live identifiers and store binding,
production database migration and reconciliation dry run, fail-closed initial
posture, deployment topology, alerting, rollback, and same-SHA public health.
Any ambiguous reconciliation record stops cutover without a lifecycle guess or
destructive rewrite.

## Submitted Candidate Rebaseline - 2026-07-29

`pressly-cents-submitted-candidate-lifecycle` supersedes the earlier exact
`PICKED_UP` proposal trigger and released-on-acceptance behavior at the
repository and local-runtime boundary:

- exact Cents `SUBMITTED` may create one immutable incoming candidate and no
  canonical or Production work;
- exact `COMPLETED` or `CANCELED` may close only a pending candidate or create
  one exact-identity tombstone; every other status is acknowledged without an
  Orders command;
- Accept creates one open canonical Order with an unreleased fulfillment;
- fulfillment release and physical intake remain separate explicit
  Pressly-owned facts before work can become schedulable;
- Reject, source closure, Restore, and tombstones remain outside Production;
  and
- source-terminal evidence for accepted canonical work may only request a
  named source-neutral resolution. Production's authoritative graph and
  operational guard decide a nondestructive resolve, review, or no-op outcome,
  and any operational participation leaves the work unchanged.

This local rebaseline does not satisfy `RV1` or `H1` and makes no deployment,
production migration, replay, production-data cleanup, live cutover, or pilot
claim. `H1` remains the current external readiness gate.

## Cents Ingress Authentication Modes

`CENTS_WEBHOOK_AUTH_MODE` makes the ingress posture explicit and reversible.
`hmac` remains the default and requires the timestamped signature contract
below. `unsigned` intentionally matches Cents' documented JSON sender while
the vendor does not provide a signing contract.

In `hmac` mode, the shared secret is an HMAC key. It is never sent as a raw
header value.

```text
X-Cents-Timestamp: <unix-seconds>
X-Cents-Signature: v1=<hex HMAC-SHA256>

signed bytes = timestamp + "." + exact raw HTTP body bytes
```

HMAC verification must:

- Read the exact raw request bytes before JSON parsing.
- Accept timestamps only inside a five-minute clock window.
- Compare signatures in constant time.
- Support current and previous keys during a bounded rotation overlap.
- Reject missing, malformed, stale, future, or incorrect signatures before a
  durable event is created.
- Never log secrets, raw signatures, bearer credentials, or customer payloads.

In `unsigned` mode, Pressly skips only source authentication. HTTPS, exact raw
body capture, JSON content type, the 256 KB limit, wire validation,
deduplication, source ordering, explicit store binding, minimized persistence,
and idempotent processing remain active. The API emits an operational warning
while unsigned mode is active. The accepted tradeoff is that a schema-valid
request cannot be proven to originate from Cents.

## Cents Wire Normalization

The public Cents article is an external wire reference, not an internal domain
contract:

<https://chathelp.trycents.com/en/articles/12083443-cents-webhooks>

The adapter must tolerate the article's documented inconsistencies without
weakening internal types:

- `action` versus `event` for event kind.
- `CANCELLED` versus internal canonical cancellation spelling.
- `dueDate` and `updatedAt` timestamps.
- `unitPrice` versus sample payload `unitCost`.
- Dollar-valued prices converted exactly to integer cents.
- `storeId` mapped explicitly to one Pressly `locationId`.
- No assumed vendor `eventId`, numeric `sourceVersion`, or `bagCount`.

Use the vendor order ID, event kind, source `updatedAt`, and raw-body digest to
derive deterministic redelivery identity when Cents provides no stable event
ID. Source ordering uses `updatedAt`, not webhook arrival order.

Customer and marketing events may reach the same endpoint because Cents can
enable all documented event types. Apply the configured ingress boundary and
classify them, persist only minimal event metadata and a digest, then
acknowledge them as ignored.
Do not retain irrelevant customer PII merely because it appeared in the body.

For order events, durable processing storage contains the minimized canonical
projection input plus a raw-body digest. Steven explicitly approved a separate
encrypted, short-retention raw quarantine on 2026-07-19 for launch diagnosis.
The quarantine is not a Production contract, has no Processor or public read
surface, expires automatically, and never changes the canonical inbox payload.
Normalization rejections are recorded before returning a client error so an
undocumented Cents shape does not disappear without evidence.

## Missing Operational Truth

The documented Cents payload does not establish physical bag count. External
systems do not own that fact, even if a future payload contains a field with
that name. The implementation must not fabricate or adopt it.

An order can be projected before intake, but it is not schedulable until the
operator records a non-negative bag count through a versioned, idempotent
Production command. The version-one observation and projection envelopes may
retain `bagCount` for compatibility, but Orders emits it as `null` and
Production ignores it as physical input. Projection must preserve any existing
operator intake and bag rows unchanged.

Cents documents zero service price before weighing. That is missing estimate
truth, not a malformed order: retain the demand with a null estimate, keep it
outside executable scheduling, and let a strictly newer source revision supply
the first positive estimate. Deployment migration backfill uses the latest
processed canonical Cents receipt when available instead of degrading known
status and weight to legacy placeholders.

Every Cents `storeId` must map to exactly one Pressly location. Unknown stores
are retained as inspectable ingress failures and never leak into another
location's scheduling query.

## Processor Session Decision

Keep the current opaque, server-validated session authority. Do not add JWTs.

Because the production processor is served through a same-origin reverse
proxy, transport the processor session in a `Secure`, `HttpOnly`,
`SameSite=Strict` cookie and require CSRF protection for unsafe requests. Keep
existing bearer support for clients that already depend on it. Processor
JavaScript must not persist the production credential in `localStorage`.

The UI must implement login, MFA challenge, session restoration, expiry,
logout, location selection, and resumption of an active shift, proposal, or
run. Server policy remains authoritative for every operation.

## Deployment Decision

Stay on the existing Lightsail, Docker Compose, and Caddy model for v1.
Kubernetes, a managed queue, and a separate worker host do not solve a current
constraint.

```text
Internet
  -> Caddy :80/:443
     -> tryPressly web domain -> web:3000
     -> API domain -> api:4000
     -> processor domain /* -> processor:80
     -> processor domain /api/* -> api:4000 with /api stripped

Private Compose network
  -> worker -> Postgres
  -> api -> Postgres
  -> no public worker or Postgres port
```

Use a 4 GB Lightsail instance as the minimum pilot target unless measured
memory from the four containers proves a smaller existing instance has safe
headroom. This is a capacity guardrail, not a permanent scaling claim.

## Delivery Shape

```text
repo/vendor truth
  T0 -> T1 -> T2 -> T3 -> T4 -> [T5, T6] -> T7 -> V1

release path
  V1 -> T8 -> T9 -> V2 -> R1 -> RV1

external gates
  RV1 -> H1 -> H2A -> H2B -> H2C -> H2D -> H3
  H3 -> V3 -> H4 -> H5 -> V4 -> H6 -> H7 -> V5
```

Repository implementation and local proof deliberately precede external
actions. The documented vendor sender and Steven's explicit 2026-07-17 launch
decision authorize the temporary unsigned mode; any other contract mismatch at
H1 still invalidates the affected webhook subgraph and requires a replan.

## Human-Owned Inputs

Stateworks will stop and request the human when these become ready:

- `H1`: obtain the exact Cents retry, payload, store, bag-count,
  reconciliation, and any future signing facts from the Cents CSM. These facts
  validate delivery, compatibility evidence, and observability; they do not
  grant Cents canonical lifecycle, fulfillment-release, or physical-intake
  authority.
- `H2A`: provision/resize the Lightsail host, static IP, firewall, time sync,
  disk headroom, and backup access.
- `H2B`: add and verify the Processor DNS record.
- `H2C`: place external env files with an explicit Cents auth mode and reviewed
  facility bootstrap input without exposing secret values.
- `H2D`: configure high-signal Worker and deployment alerts.
- `H3`: approve and deploy only a main-branch release whose CI produced all
  five immutable digests.
- `H4`: run the idempotent production bootstrap and verify the real location,
  store mapping, stations, machines, scheduler config, operator account, and
  MFA.
- `H5`: configure Cents delivery only after public routing, the explicitly
  configured ingress mode, Processor, Worker, and rollback checks pass.
- `H6`: approve a controlled happy-path pilot.
- `H7`: operate the pilot with explicit stop conditions and manual fallback.

No secret value, raw customer payload, token, recovery code, database URL, or
private key may be pasted into Stateworks, Git, screenshots, logs, or agent
messages. Evidence records names, versions, timestamps, hashes, and redacted
outcomes only.

## Explicitly Deferred

- Manual hold, hard-confirmed cancellation, rewash/rework, missing or damaged
  bag, breakdown, late work, reassignment, and other exception-state UX.
- Advanced or distributed optimization beyond the deterministic fixed-pulse
  scheduler.
- Washer/dryer hardware integration.
- Splitting modules into independently deployed services.
- A message broker or orchestration platform.

An exception encountered during the pilot stops LPMS operation for that work;
operators return to the existing manual process. The pilot must not improvise
an unmodeled state change.

## Done Means

- Real runtime code contains no demo mode, hardcoded location, frozen date, or
  production fixture.
- A valid event under the configured ingress mode reaches durable ingestion and
  one idempotent Orders observation. Only an explicit Orders command and its
  directed graph can change lifecycle or fulfillment release; its transactional
  outbox is projected idempotently into Production. Invalid and replayed
  requests behave as specified, and HMAC-only signature cases remain proven in
  HMAC mode.
- Location isolation and missing-intake rules are proven in database and HTTP
  tests, including proof that external `bagCount` evidence cannot create or
  overwrite operator-recorded physical intake.
- The processor signs in, resumes real state, and drives the existing happy
  path without exposing a session token to JavaScript storage.
- Worker health, retries, dead letters, replay, lag, and fatal failure are
  observable and alertable.
- CI publishes, scans, records, deploys, and rolls back API, Web, Worker, and
  Processor as one immutable release.
- Caddy exposes only the intended HTTPS routes; worker and Postgres stay
  private.
- Human setup, webhook smoke under the configured mode, facility bootstrap,
  rollback proof, and a controlled pilot have redacted evidence.
- Documentation and durable laundry-production memory contain only facts
  proven by the completed work.
