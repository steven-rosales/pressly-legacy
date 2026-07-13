# LPMS Production Readiness

## Status

Active. This work started after the locally verified LPMS v1 happy path.

The purpose is to replace the remaining demo and unverified-vendor seams with
one deployable, observable, authenticated production path. It does not add the
deferred exception workflows.

## Outcome

An authorized Pressly operator can:

1. Sign in to the processor with the existing opaque server-side session and
   MFA flow.
2. Select an actual location and resume its current production workspace.
3. Receive an authenticated Cents order event, ingest it durably, translate it
   through a Worker-owned source adapter into canonical Production demand,
   record missing intake facts such as bag count, and see the order become
   schedulable only when all required facts exist.
4. Create and accept a deterministic schedule, then operate the four fixed
   stages through the processor.
5. Detect and recover from webhook duplicates, stale delivery, worker retries,
   dead letters, restarts, and a missed vendor delivery when the vendor exposes
   a reconciliation API.

The production release contains four immutable application images: `api`,
`web`, `worker`, and `processor`. Caddy is the only public ingress. The worker
is a separate private long-lived container because its lifecycle, retry, and
failure behavior differ from the API.

## Verified Starting Point

- `stateworks/work/done/lpms-v1-happy-path/` proves the local deterministic
  happy path.
- The API already composes production business, policy, scheduling, access
  control, and persistence boundaries.
- The webhook route is `/webhooks/cents`, but live verification currently
  fails closed and the internal Cents contract is synthetic rather than the
  documented wire payload.
- The processor defaults to a `?live=1` opt-in and otherwise uses hardcoded
  demo orders, dates, location, proposal, and board state from `src/`.
- The worker has durable leases, retries, and dead-letter behavior, but its
  runtime still uses null logging and metric sinks and does not schedule
  reconciliation.
- Local Compose contains the worker and processor. Production Compose,
  release manifests, deploy, rollback, and public routing still contain only
  API and Web.
- Production location, Cents-store mapping, station, machine, and initial
  scheduler configuration are not yet bootstrapped through an operator-owned
  idempotent procedure.

These are inputs to the plan, not claims that the implementation will remain
unchanged. T0 must re-check them before edits.

## Current Module Boundary

The post-V2 refactor adds a deliberate change-control pair, `R1 -> RV1`, before
the first external gate:

- `modules/business/webhook-ingestion` owns generic durable inbox lifecycle,
  dead letters, replay, and source-location bindings.
- `apps/api/src/vendors/cents` owns Cents authentication and wire
  normalization.
- `apps/worker` owns the `source:subjectType` consumer registry and composes
  webhook ingestion with injected downstream module capabilities.
- `modules/business/production` accepts a canonical `ApplyOrderDemand` command
  and contains no Cents, webhook, receipt, lease, or CRM language.
- Stable `webhook:<event-id>` Production idempotency closes the crash window
  between Production commit and inbox completion without coupling module
  transactions.

Historical V2 evidence remains useful but does not prove this new boundary.
RV1 must rerun repository, database, integration, and isolated Docker-topology
proof before work returns to H1.

## Required Cents Security Contract

The shared secret is an HMAC key. It is never sent as a raw header value.

```text
X-Cents-Timestamp: <unix-seconds>
X-Cents-Signature: v1=<hex HMAC-SHA256>

signed bytes = timestamp + "." + exact raw HTTP body bytes
```

Production verification must:

- Read the exact raw request bytes before JSON parsing.
- Accept timestamps only inside a five-minute clock window.
- Compare signatures in constant time.
- Support current and previous keys during a bounded rotation overlap.
- Reject missing, malformed, stale, future, or incorrect signatures before a
  durable event is created.
- Never log secrets, raw signatures, bearer credentials, or customer payloads.

If Cents can only send a static secret header, live enablement is blocked. IP
allowlisting can be added as defense in depth after Cents confirms stable
egress ranges, but it is not an authenticity mechanism.

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
enable all documented event types. Authenticate and classify them, persist
only minimal event metadata and a digest, then acknowledge them as ignored.
Do not retain irrelevant customer PII merely because it appeared in the body.

For order events, durable storage contains the minimized canonical projection
input plus a raw-body digest. Raw PII is not retained by default. Encrypted
short-retention raw quarantine requires a later explicit decision and is not
silently introduced by this work.

## Missing Operational Truth

The documented Cents payload does not establish a trustworthy bag count.
The implementation must not fabricate it.

An order can be projected before intake, but it is not schedulable until the
operator records a non-negative bag count through a versioned, idempotent
production command. If Cents later proves it supplies an authoritative bag
count, the adapter may populate the same fact with provenance.

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
actions. A vendor contract mismatch at H1 invalidates the affected webhook
subgraph and requires a replan; it does not authorize a weaker verifier.

## Human-Owned Inputs

Stateworks will stop and request the human when these become ready:

- `H1`: obtain the exact Cents signing, retry, payload, store, bag-count, and
  reconciliation facts from the Cents CSM.
- `H2A`: provision/resize the Lightsail host, static IP, firewall, time sync,
  disk headroom, and backup access.
- `H2B`: add and verify the Processor DNS record.
- `H2C`: place external env files, a generated HMAC secret, and reviewed
  facility bootstrap input without exposing their values.
- `H2D`: configure high-signal Worker and deployment alerts.
- `H3`: approve and deploy only a main-branch release whose CI produced all
  four immutable digests.
- `H4`: run the idempotent production bootstrap and verify the real location,
  store mapping, stations, machines, scheduler config, operator account, and
  MFA.
- `H5`: configure Cents delivery only after public routing, signed ingress,
  Processor, Worker, and rollback checks pass.
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
- A valid signed event reaches durable ingestion and one idempotent canonical
  Production demand application;
  invalid, altered, stale, and replayed requests behave as specified.
- Location isolation and missing-intake rules are proven in database and HTTP
  tests.
- The processor signs in, resumes real state, and drives the existing happy
  path without exposing a session token to JavaScript storage.
- Worker health, retries, dead letters, replay, lag, and fatal failure are
  observable and alertable.
- CI publishes, scans, records, deploys, and rolls back API, Web, Worker, and
  Processor as one immutable release.
- Caddy exposes only the intended HTTPS routes; worker and Postgres stay
  private.
- Human setup, signed webhook smoke, facility bootstrap, rollback proof, and a
  controlled pilot have redacted evidence.
- Documentation and durable laundry-production memory contain only facts
  proven by the completed work.
