# Processor

The processor is the LPMS operator interface. It is a React/Vite app built on
the repository's shadcn foundation and the neutral product language captured in
`docs/agents/10/`.

## Run

```bash
pnpm --filter @pressly/processor dev
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

Useful views:

```text
/?view=schedule
/?view=board
/?view=settings
```

## Verify

```bash
pnpm --filter @pressly/processor test
pnpm --filter @pressly/processor typecheck
pnpm --filter @pressly/processor lint
pnpm --filter @pressly/processor build
```

The UI does not compute schedules, infer transitions, or authorize work. It
renders protocol results and submits output hashes, optimistic versions, and
idempotency keys back to the API.

## Architecture

The processor is a client-only Vite SPA, so `main.tsx` and `src/app/` are its
composition boundary. Concrete effects never originate inside product
features.

```text
src/app/          runtime composition, navigation, providers, app shell
src/ports/        framework-free capabilities and expected errors
src/adapters/     API transport, authentication, production, and location preference
src/features/     product model/view slices
src/components/   layout and shadcn UI primitives
```

Dependency direction is `app -> features/adapters/ports`,
`features -> ports/components`, and `adapters -> ports/contracts`. Peer feature
imports, feature-to-adapter imports, outward port imports, product-aware UI
primitives, and generic catch-all folders are rejected by ESLint and covered by
the repository architecture tests. Feature, port, and adapter files also use an
enforced role suffix.
