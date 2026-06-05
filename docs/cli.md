# CLI Composition And Data Flow

Purpose: explain how `apps/cli` turns terminal input into parsed commands,
API calls, session reads/writes, output, and exit codes.

Use this when adding or changing a CLI feature.

## Quick Map

```txt
main.ts
  -> app.ts
    -> shell/run-cli.ts
      -> features/<feature>/args.ts
      -> features/<feature>/application/*
      -> features/<feature>/adapters/*
      -> shell/api-client.ts + shell/session-store.ts
      -> features/<feature>/presentation/*
      -> stdout/stderr + exit code
```

Short version:

```txt
entrypoint -> composition root -> shell runner -> feature -> adapter -> API
```

## Runtime Roles

`src/main.ts` is the process boundary.

- Loads `apps/cli/.env.local`.
- Passes `process.argv.slice(2)`, `process.env`, and stdio into `runPresslyCli`.
- Sets `process.exitCode`.

`src/app.ts` is the composition root.

- Creates one shared `sessionStore`.
- Builds the feature list.
- Injects concrete API clients into each feature.
- Calls `runCli({ argv, env, io, features })`.

Current composition:

```txt
sessionStore = makeSessionStore()
auth    -> makeApiAuthClient(env, sessionStore)
pricing -> makeApiPricingClient(env, sessionStore)
runCli(...)
```

`src/shell/run-cli.ts` is the generic shell runner.

- Handles top-level help.
- Finds the feature namespace from the first positional argument.
- Calls `feature.parse(argv)`.
- Builds the feature client with `feature.makeClient(env)`.
- Runs plain mode or Ink mode.
- Writes output/errors.
- Closes the client in `finally`.

Plain mode runs when `--json` is passed, the feature sets
`interactive: false`, or `stdout` is not a TTY.

Interactive mode renders:

```txt
render(feature.createView({ command, client }))
```

## Feature Shape

`src/shell/feature.ts` defines the shared feature contract:

```txt
namespace    auth, pricing, etc.
usage        help text
parse        argv -> typed command or help
makeClient   env -> client
run          command + client -> Result
present      output -> human text
serialize    output -> JSON value
createView   command + client -> Ink element
interactive  defaults to true
```

Use this folder shape:

```txt
src/features/<feature>/
  index.ts
  cli.ts
  args.ts
  application/
    command.ts
    ports.ts
  adapters/
    api-client.ts
  presentation/
    presenter.ts
    <Feature>CliView.tsx
```

File responsibilities:

- `index.ts`: public exports for `app.ts` and tests.
- `cli.ts`: wires the feature with `makeCliFeature`.
- `args.ts`: parses raw `argv` into a typed command.
- `application/command.ts`: decides what operation to run.
- `application/ports.ts`: defines the client interface the command needs.
- `adapters/api-client.ts`: implements the port with HTTP/session effects.
- `presentation/presenter.ts`: renders human text and JSON values.
- `<Feature>CliView.tsx`: optional Ink state machine.

## Feature Data Flow

Raw command:

```txt
pressly-admin pricing publish --service wash-fold --set delivery_fee=4.95 --reason "Update" --yes
```

`args.ts` parses raw strings into a command object:

```txt
PricingCliCommand
  action: publish
  serviceSlug: wash-fold
  items: [...]
  reason: Update
  confirm: true
  json: false
```

`application/command.ts` runs the use case through a port:

```txt
show    -> client.loadCatalog(...)
plan    -> client.planChange(...)
publish -> client.publishChange(...)
```

The command should not know API URLs, HTTP paths, bearer tokens, `fetch`,
session storage, or terminal rendering.

Those belong to adapters, shell helpers, and presentation.

## API And Session Flow

`adapters/api-client.ts` implements the application port.

Adapter responsibilities:

- Read `PRESSLY_API_URL`.
- Build endpoint paths.
- Read/write/clear sessions when needed.
- Add bearer tokens.
- Call `requestApi`.
- Return `Result<value, AppError>`.

`src/shell/api-client.ts` owns HTTP mechanics:

- Default API URL is `http://localhost:4000`.
- Requests use `fetch`.
- JSON bodies set `content-type: application/json`.
- Bearer tokens become `Authorization: Bearer <token>`.
- API responses must be `{ ok: true, data }` or `{ ok: false, error }`.
- API failures become `AppError`.

`src/shell/session-store.ts` owns local session persistence:

```txt
~/.config/pressly/admin-session.json
```

Session operations:

- `read()`: stored login result or `undefined`.
- `write(session)`: create directory and write session JSON.
- `clear()`: remove session file.

Permissions:

- Directory: `0o700`.
- Session file: `0o600`.

Current session flow:

```txt
auth login
  -> POST /auth/login
  -> write returned session

pricing commands
  -> read session
  -> send accessToken as bearer token

auth logout
  -> POST /auth/logout when a session exists
  -> clear session
```

## Output Flow

Plain output uses the feature result:

```txt
command.json ? feature.serialize(output) : feature.present(output)
```

Rules:

- Human text lives in `presentation/presenter.ts`.
- JSON output should return data, not terminal-formatted text.
- Errors go through shell error helpers.
- Unknown thrown errors are normalized into `AppError`.

Interactive output uses Ink.

Pricing is the current example:

- Plain pricing uses `runPricingCommand`.
- Interactive pricing uses `PricingCliView.tsx`.
- Shared conversion stays in `application/command.ts` when both paths need it.

## Boundary Rules

Allowed:

- `app.ts` composes features.
- `cli.ts` wires files inside one feature.
- `args.ts` imports command types.
- `application/command.ts` imports ports and shared contracts/errors.
- `adapters/*` imports ports and shell effect helpers.
- `presentation/*` imports output types and formatting helpers.

Avoid:

- One feature importing another feature.
- `application/*` importing `adapters/*`.
- `application/*` importing `presentation/*`.
- `application/*` importing `args.ts`, `cli.ts`, or `index.ts`.
- HTTP details inside application commands.
- terminal rendering inside adapters.

The architecture test enforces:

```txt
features cannot import other features
application code cannot import same-feature outer layers
```

## Add A Feature

1. Create `src/features/<feature>/application/ports.ts`.
2. Create `src/features/<feature>/application/command.ts`.
3. Create `src/features/<feature>/args.ts`.
4. Create `src/features/<feature>/adapters/api-client.ts`.
5. Create `src/features/<feature>/presentation/presenter.ts`.
6. Add an Ink view only if the feature needs interactive state.
7. Create `src/features/<feature>/cli.ts`.
8. Export from `src/features/<feature>/index.ts`.
9. Compose the feature in `src/app.ts`.
10. Add tests under `apps/cli/test/features/<feature>/`.

Minimum `cli.ts` shape:

```ts
export const makeExampleCli = (deps: ExampleCliDeps = defaultDeps) =>
  makeCliFeature<ExampleCliCommand, ExampleClient, ExampleCliOutput>({
    namespace: 'example',
    usage,
    parse: parseExampleCliCommand,
    makeClient: deps.makeExampleClient,
    run: runExampleCommand,
    present: presentExampleOutput,
    serialize: serializeExampleOutput,
    interactive: false,
    createView: () => createElement(Text, null, ''),
  });
```

Minimum `app.ts` composition:

```ts
makeExampleCli({
  makeExampleClient: (env) => makeApiExampleClient(env, sessionStore),
});
```

## Test Checklist

Cover parser success/errors, command behavior with a fake client, adapter paths
and HTTP details, human/JSON output, and Ink behavior only for interactive
features.

Keep this passing:

```txt
pnpm -F @pressly/cli test
pnpm -F @pressly/cli typecheck
pnpm -F @pressly/cli typecheck:test
pnpm -F @pressly/cli lint
```
