# Processor browser host

This workspace owns the generic React/Vite lifecycle for the Processor. The
Processor workflow, presentation, state, and browser-facing capabilities live
in `experiences/processor`; the host supplies browser globals, startup,
observability, the root error boundary, global CSS, and build configuration.
`DESIGN.md` remains the current visual and interaction authority.

## Run

```bash
pnpm --filter @pressly/processor-browser-host dev
```

The processor is live-only. `VITE_API_URL` defaults to `/api`; Vite proxies that
path during local development and the production reverse proxy owns it after
deployment. The app restores the existing opaque server-side session through a
same-origin HttpOnly cookie. JavaScript receives only a per-session CSRF proof,
keeps it in memory, and never writes a reusable credential to browser storage.

The signed-in workspace discovers the principal's allowed locations, remembers
only the selected location identifier, and then loads current workspace,
orders, configuration, shift, proposal, board, stations, and machines from the
API. Synthetic production data exists only under `test/`.

One available production location opens automatically. If an account can
access several locations, the processor restores its last valid browser
preference or asks for a location before loading production data; the same
selector remains available in the workspace header.

Browser routes:

```text
/orders
/intake
/forecast
/schedule
/schedule/:shiftId
/production
/production/:runId
/configuration
/history
```

Query parameters do not own navigation. There is no legacy `/?view=...`
compatibility redirect and no root redirect; use `/schedule` as the planning
entry point. Shift and run identifiers in the path make refresh and history
navigation resumable from backend state.

The app does not poll workspaces or boards on a timer. While authenticated,
online, and visible, it opens the location-authorized SSE change feed. Revision
events are invalidations only: a coalescing coordinator reloads the
authoritative workspace or run board, aborts stale targets, and fences late
responses. Mutations still await an immediate refresh before navigation. The
stream disconnects while hidden or offline and reconnects with a full reload;
its heartbeat carries no production state.

## Verify

```bash
pnpm --filter @pressly/processor-browser-host test
pnpm --filter @pressly/processor-browser-host typecheck
pnpm --filter @pressly/processor-browser-host lint
pnpm --filter @pressly/processor-browser-host build

pnpm --filter @pressly/experience-processor test
pnpm --filter @pressly/experience-processor typecheck
pnpm --filter @pressly/experience-processor lint
pnpm --filter @pressly/experience-processor build
```

The UI does not compute schedules, infer transitions, or authorize work. It
renders protocol results and submits output hashes, optimistic versions, and
idempotency keys back to the API.

## Architecture

`src/main.tsx` reads the browser environment and starts the host from the
generated Processor runtime binding. The generated binding composes the
Experience application; the host never imports system business code.

```text
hosts/browser/processor/src/
  main.tsx                         browser process entrypoint
  processor-browser-host.ts       generic React root lifecycle
  processor-error-boundary.tsx    root failure containment
  processor-observability.ts      browser telemetry adapter
  index.css                        browser-global CSS

experiences/processor/src/
  browser/                         Experience shell and presentation
  cells/                           cross-system Processor operations
  features/                        product workflow slices
  capabilities/                    narrow Experience dependencies
  contracts/                       Experience-owned serialized projections
```

Dependency direction is host to generated/runtime and platform mechanisms;
the generated runtime connects the host to `@pressly/experience-processor`.
Processor localization, navigation, components, and product features stay in
the Experience. Systems remain reachable only through declared generated
clients or narrow public capabilities selected by topology.
