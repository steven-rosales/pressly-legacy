# Admin CLI Composition

## Purpose

Current source CLI construction, routing, auth, stored sessions, API calls, pricing authorization, and stale `dist` caveat.

## What Changed

- The CLI is composed from feature modules.
- `apps/cli/src/main.ts` registers `authCli` and `pricingCli`.
- The source CLI talks to the API with bearer tokens saved by `auth login`.
- The source CLI no longer uses the old local pricing database adapter.

## Where

- Entrypoints: `package.json`, `tooling/scripts/run-admin-cli.mjs`, `apps/cli/src/main.ts`
- Shell: `apps/cli/src/shell/run-cli.ts`, `feature.ts`, `api-client.ts`
- Features: `apps/cli/src/features/auth/*`, `apps/cli/src/features/pricing/*`
- API composition: `apps/api/src/app.ts`, `modules/auth/src/main.ts`, `modules/pricing/src/main.ts`
- Session tables: `auth_sessions`, `auth_identity_roles`

## Why

Not shown in inspected evidence; this records current source behavior.

## Construction

1. `pnpm admin` runs `tooling/scripts/run-admin-cli.mjs`.
2. The wrapper builds CLI workspace dependencies quietly.
3. The wrapper runs `apps/cli/src/main.ts` with `tsx`.
4. `main.ts` loads `apps/cli/.env.local`.
5. `main.ts` passes `argv`, `process.env`, and terminal IO into `runCli`.
6. `runCli` matches the first positional argument to a feature namespace.
7. Each feature owns its parser, client factory, runner, presenter, and view.
8. `runCli` creates the feature client, runs the command, and calls `close()`.
9. JSON output and non-TTY output use plain rendering.
10. TTY pricing commands can render through Ink.
11. Auth commands are non-interactive.

## Session Mechanics

1. `auth login` requires `--email` and `--password`.
2. The auth client posts the credentials to `POST /auth/login`.
3. The API normalizes the email and checks recent failed attempts.
4. The API loads the identity, password credential, and identity roles.
5. The API verifies the password.
6. The API issues an access token.
7. The API stores only the token hash in `auth_sessions`.
8. The API returns the raw token, expiry, and principal roles.
9. The CLI writes that login result to `~/.config/pressly/admin-session.json`.
10. The CLI creates the config directory with mode `0700`.
11. The CLI writes the session file with mode `0600`.
12. `auth session` reads the local file and calls `GET /auth/session`.
13. The API hashes the bearer token and reloads the session from the database.
14. The API joins the session to the identity.
15. The API reloads roles from `auth_identity_roles`.
16. The API rejects missing, inactive, revoked, or expired sessions.
17. The API updates `last_used_at` through `touchSession`.
18. `auth logout` calls `POST /auth/logout` and clears the local file.

## Pricing Mechanics

1. Pricing commands use `makeApiPricingAdminClient`.
2. Before each pricing request, the client reads the stored session token.
3. Missing local session returns `missing_cli_session`.
4. `pricing show` calls `GET /pricing/.../pricing`.
5. `pricing plan` calls `POST /pricing/changes/plan`.
6. `pricing publish` calls `POST /pricing/changes/publish`.
7. The API composes auth guards into pricing routes.
8. Pricing read and plan allow `owner` and `admin`.
9. Pricing publish allows `owner` only.
10. Pricing publish also requires a fresh session.
11. The pricing author comes from `res.locals.auth.actor`.

## Role Source

- The source CLI does not assign roles from `PRESSLY_ACTOR_ROLE`.
- Roles come from the authenticated identity stored in the auth database.
- The API selects the highest role from the principal before building the actor.

## Output Modes

- `--json` uses plain serialized output.
- Non-TTY output uses plain text or JSON.
- TTY pricing commands use Ink when the feature is interactive.
- Plain `pricing publish` requires `--yes`.
- TTY `pricing publish` can show a plan and ask for `y` or `n`.

## Caveat

- `apps/cli/dist` is ignored build output and can be stale.
- The current root `pnpm admin` path runs source with `tsx`.
- `pnpm -F @pressly/cli start` or an old installed bin can use stale `dist`.

## Effect

- The CLI shell owns terminal mechanics.
- Feature modules own command behavior.
- The API owns authentication, session validation, roles, and authorization.
- The local CLI only stores the returned session token for later API calls.
