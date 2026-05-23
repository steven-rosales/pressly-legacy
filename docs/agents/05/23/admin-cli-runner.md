# Admin CLI Runner

## 1. What Changed

The root admin scripts now run through one small wrapper:

```bash
node ./tooling/scripts/run-admin-cli.mjs
```

This wrapper hides setup noise during successful commands.

Instead of printing every Docker, install, and workspace build line, it prints a
short status message and then lets the real CLI output show.

Examples:

```txt
Loading admin CLI...
```

```txt
Showing pricing catalog...
```

If setup fails, the wrapper prints the hidden log so the failure can still be
debugged.

## 2. Where

Script:

- `tooling/scripts/run-admin-cli.mjs`

Root commands:

- `package.json`
  - `admin`
  - `admin:docker`

CLI entrypoint:

- `apps/cli/src/main.ts`

Docker dependency setup:

- `apps/api/Dockerfile`

## 3. Why

The old `admin:docker` command printed too much orchestration output.

The useful output was buried under:

- `docker compose run` status
- `pnpm install` logs
- workspace package build logs
- dotenv injection logs

The wrapper keeps those steps, but makes normal admin usage easier to read.

## 4. Effect

Use the same commands as before:

```bash
pnpm admin:docker --help
pnpm admin:docker pricing show --service wash-fold
```

Successful runs now look like:

```txt
Showing pricing catalog...

Pricing catalog

Service: wash-fold
...
```

Failed setup runs still show the captured install or build output.

So the command stays debuggable, but the happy path is much quieter.

## 5. How It Works

The wrapper has two paths.

Local path:

```txt
pnpm admin ...
```

1. Prints a short status message.
2. Builds CLI workspace dependencies quietly.
3. Runs `apps/cli/src/main.ts` with `tsx`.

Docker path:

```txt
pnpm admin:docker ...
```

1. Prints a short status message.
2. Runs a one-off `api` container.
3. Passes `PRESSLY_ADMIN_DATABASE_URL` for the Docker Postgres service.
4. Installs dependencies quietly.
5. Builds CLI workspace dependencies quietly.
6. Runs the real CLI command.

The wrapper does not replace the CLI.

It only cleans up the command runner around the CLI.
