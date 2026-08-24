# How to Read the Repository

Read Pressly by following one operation through the checked topology. Do not
start with folders in isolation.

## Mental Model

```text
system or Experience owns meaning
  -> cell owns one operation
  -> topology selects it
  -> generated catalog or client records the selection
  -> generic host executes the protocol
  -> app supplies process effects or browser presentation
```

The six durable systems are Access, Customers, Ingress, Orders, Pricing, and
Production. Control, Customer, and Processor Experiences coordinate public
capabilities across those systems.

## Start With Current Authority

Before product or domain work:

1. Read `stateworks/memory/index.yaml`.
2. Load the relevant domain context pack.
3. Inspect `stateworks/work/active` and `stateworks/work/queued`.
4. Treat code, migrations, and runtime contracts as implementation truth.

Stateworks memory preserves durable meaning. Active work preserves unfinished
status and proof. Historical plans and completed work do not override the
current checkout.

## Find an Operation

If you know its stable ID, ask topology:

```bash
pnpm architecture:explain -- production.advance-stage.v1
```

The explanation names the owner, cell source, assembly key, consistency,
authorization, surfaces, messages, consumers, and observability identity.

If you do not know the ID, search the generated inventory:

```bash
rg -n "advance-stage|Advance stage" generated/architecture-map.ts
```

Then read outward to inward:

1. `topology/pressly.topology.ts` — is the operation deployed?
2. `generated/architecture-map.ts` — what does deployment expose?
3. Owner `public.ts` and `system.ts` — how is the cell assembled?
4. `cells/<namespace>/<verb-object>/cell.ts` — what is declared?
5. `contract.ts` or `boundary.ts` — what crosses the boundary?
6. `types.ts` or `.model.ts` — what does the application mean?
7. `decide.ts`, `.policy.ts`, or `.lifecycle.ts` — what is pure?
8. `execute.ts` or `.usecase.ts` — which effects occur and in what order?
9. `postgres.ts`, `*.repo.ts`, or adapters — how are effects implemented?
10. Colocated and `verification/*` tests — what is actually proved?

## Trace a Protocol

### HTTP or SSE

```text
hosts/http/src/main.ts
  -> generated/runtime HTTP binding
  -> generated/http-catalog.ts or generated/event-stream-catalog.ts
  -> selected system or Experience cell
```

The cell owns the structural surface. `topology/pressly-http-boundaries.ts`
owns deployment boundary profiles. The HTTP host supplies concrete
authentication, authorization, CSRF, rate-limit, context, observation, and
lifecycle providers.

### Jobs

```text
hosts/jobs/src/main.ts
  -> generated/runtime jobs binding
  -> generated/job-catalog.ts
  -> Ingress or Production reaction
  -> owner-owned durable queue capability
```

The generated catalog contains the selected job identities and retry facts.
The Jobs host owns polling, heartbeat, lease delivery, observation, and
shutdown; Systems own durable queue state and business disposition.

### CLI

```text
hosts/cli/src/main.ts
  -> generated/runtime CLI binding
  -> generated/cli-catalog.ts
  -> Access or Control-owned cell
```

The host owns environment, stdin/stdout, prompts, token storage, signals, and
exit behavior. The owner cell owns the command meaning.

### Browser

```text
frontend entry
  -> hosts/browser/<experience>
  -> generated/runtime browser binding
  -> experiences/<experience>
  -> generated/clients/<experience>.ts
  -> generated HTTP operation
```

Browser models own presentation state only. Server capabilities and cell
contracts remain authoritative.

## Trace State

For database behavior, follow:

```text
cell executor
  -> owner Postgres adapter
  -> injected owner schema segment
  -> systems/<owner>/src/schema
  -> topology/pressly-postgres-schema.ts
```

The table definition lives with the owning system. Foreign keys never cross
owner boundaries; topology composes the independent owner segments without
joining their persistence authority. Cross-system identity moves through
data-only contracts and explicit reconciliation. Upgrade order lives
separately in `platform/postgres/migrations`; the clean pre-user epoch is one
immutable, append-only ledger, not a schema owner.

For cross-system behavior, look for a versioned public capability or durable
message. A direct peer-schema or peer-private-cell import is a defect.

## Read the Generated Graph Safely

Generated files are useful indexes:

- `architecture-map.ts` — every selected operation and consumer;
- `http-catalog.ts` — executable HTTP selection and profiles;
- `job-catalog.ts` — selected Worker reactions;
- `cli-catalog.ts` — CLI program and commands;
- `event-stream-catalog.ts` — selected subscriptions;
- `clients/*.ts` — browser-safe operations per Experience.

Never edit them. Change an owner declaration or topology, then run:

```bash
pnpm architecture:generate
pnpm architecture:generated:check
```

## Three Useful Questions

When traversal becomes confusing, ask:

1. Which owner can change this meaning?
2. Which cell is the one observable operation?
3. Is this file deciding, translating, or performing an effect?

Those answers should lead to one system or Experience, one cell, and one
checked path into the deployed graph.
