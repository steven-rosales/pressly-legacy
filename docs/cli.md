# CLI Composition And Data Flow

Purpose: explain how Pressly CLI entrypoints reach selected owner cells while
keeping process effects in `hosts/cli`.

## Runtime Map

```txt
topology
  -> generated/cli-catalog.ts
    -> Access bootstrap-owner cell
    -> Control auth, pricing, and production-bootstrap cells

hosts/cli entrypoint
  -> generated/runtime CLI binding
    -> generated catalog view for that entrypoint
    -> generic CLI executor
      -> selected owner cell
      -> host-owned API, session, DB, stdin, output, and Ink adapters
```

There is one command registry: `generated/cli-catalog.ts`.

The generated runtime filters that catalog by process entrypoint. The host does
not declare another command list.

## Entrypoints

`pressly-admin` exposes ten commands:

- `auth login`
- `auth session`
- `auth logout`
- `auth mfa-enroll`
- `auth mfa-confirm`
- `auth mfa-recovery-codes`
- `auth mfa-remove`
- `pricing show`
- `pricing plan`
- `pricing publish`

Two package scripts expose one bootstrap command each:

- `bootstrap:owner` prefixes synthetic argv with `bootstrap owner`.
- `bootstrap:production` prefixes synthetic argv with `bootstrap production`.

The bootstrap files under `src/commands/` are thin process boundaries. Command
parsing and presentation remain owner-driven.

## Ownership

Control Experience owns:

- auth and pricing CLI contracts, decisions, and presentation;
- production bootstrap preview/apply orchestration;
- exact program, group-help, and unknown-command bytes;
- interactive pricing frames and key decisions.

Access System owns:

- the bootstrap-owner contract and CLI surface;
- the narrow `makeAccessBootstrapCliSystem` generated assembly;
- the atomic initial business/owner PostgreSQL bootstrap and password-hash
  failure semantics.

The generic CLI host owns only business-neutral mechanics:

- command resolution and option parsing;
- argument, stdin, context, and capability sequencing;
- plain presentation routing;
- the opaque interactive session protocol.

## Host-Owned Effects

`hosts/cli/src/runtime/` supplies process capabilities to generated runtime and
owner cells.

### API

- `PRESSLY_API_URL` is trimmed.
- Empty or missing values default to `http://localhost:4000`.
- HTTPS is required for every non-loopback API URL.
- Plain HTTP is accepted only for the exact loopback hosts `localhost`,
  `127.0.0.1`, and `[::1]`.
- URL credentials and non-HTTP(S) schemes are rejected before a client is
  created. Rejection diagnostics never include the supplied URL bytes.
- API clients are created only for a valid auth or pricing command.
- Auth commands use the Control-owned `/control/cli/auth/*` bearer realm;
  Customer `/auth/*` routes remain Customer-only and `/control/auth/*` remains
  the browser cookie/CSRF realm.
- The client closes once after the command.
- A command error has priority over a later client-close error.

### Auth secret input

Authentication secrets are redirected-stdin data, never command arguments,
environment variables, temporary files, or diagnostic fields.

- `auth login` accepts `--email` plus the boolean `--secret-stdin` marker. Its
  stdin is a JSON object with required `password` and, when MFA is required,
  exactly one of `mfaCode` or `recoveryCode`.
- `auth mfa-confirm` accepts only the boolean `--secret-stdin` marker. Its
  stdin is the plain UTF-8 enrollment confirmation code.
- Login stdin is capped at 4,096 bytes; confirmation stdin is capped at 128
  bytes. Both reject a TTY so secrets cannot be entered accidentally into an
  echoing terminal.
- A secret manager or other trusted producer should write directly to the
  command's pipe. Do not stage the producer output in a shell variable or
  file, and do not enable shell command tracing around the pipe.
- Legacy `--password`, `--mfa-code`, `--recovery-code`, and `--code` value
  options, and positional secret values, are rejected before API execution.

### Session file

The default path is:

```txt
~/.config/pressly/admin-session.json
```

- Reads validate the stored authenticated-session contract.
- Parent directories use mode `0o700`.
- The session file uses mode `0o600`.
- Login writes only an authenticated session.
- Logout clears only after successful remote revocation when a session exists.

### Bootstrap database

- `DATABASE_URL` is read only after a bootstrap command parses.
- Each bootstrap process creates one lazy database runtime with
  `maxConnections: 1`.
- The runtime closes in `finally` behavior on success or failure.
- Owner bootstrap opens the runtime before reading redirected password bytes.
- Owner bootstrap normalizes explicit business slug and display-name context,
  atomically creates the initial Access business and owner graph, and reports a
  replay only for the same active business, normalized owner email, and
  verified password. A divergent retry cannot replace credentials.
- Owner context is supplied through `PRESSLY_BOOTSTRAP_BUSINESS_ID`,
  `PRESSLY_BOOTSTRAP_BUSINESS_SLUG`,
  `PRESSLY_BOOTSTRAP_BUSINESS_DISPLAY_NAME`,
  `PRESSLY_BOOTSTRAP_OWNER_EMAIL`, and
  `PRESSLY_BOOTSTRAP_OWNER_CONFIRM`; the password remains stdin-only.
- Owner password stdin is bounded to 4,096 bytes by the host while streaming;
  excess input is rejected before Access executes.
- Production bootstrap validates a fully read manifest against a one-MiB
  ceiling, then maps it into Access, Production, and Ingress authority inputs.

Production apply order is fixed:

```txt
Access location preview
production preview
source-location bindings preview
Access location apply
production apply
source-location bindings apply
```

Any rejected preview stops every apply operation.

### Interactive pricing

The owner drives frames and key decisions through a neutral interactive
session. The host adapts that session to Ink.

- Informational progress is cyan.
- The publish confirmation prompt is yellow.
- Plan and result lines use the default terminal color.
- `y` publishes.
- `n` or Escape cancels with exit code `1`.
- `--json` bypasses Ink.

## Adding Or Changing A Command

1. Change the owning cell or Experience surface.
2. Add the command to the checked topology.
3. Regenerate `generated/cli-catalog.ts`.
4. Keep new process effects behind a narrow capability in `hosts/cli`.
5. Add released-byte and lifecycle proof under `hosts/cli/test/runtime/`.

Do not add a host-local command registry, import one owner from another, or
move domain decisions into the host or Ink adapter.

## Verification

Run:

```bash
pnpm --filter @pressly/cli-host lint
pnpm --filter @pressly/cli-host typecheck
pnpm --filter @pressly/cli-host test
pnpm --filter @pressly/cli-host build
pnpm architecture:check
pnpm lint:architecture
```

PostgreSQL changes to bootstrap owner also require the Access one-worker
integration gate.
