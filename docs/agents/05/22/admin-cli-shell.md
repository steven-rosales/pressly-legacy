# Admin CLI Shell

## 1. What Changed

The admin CLI now has an Ink terminal app for interactive pricing work.

It still keeps a plain command path for scripts, JSON output, and non-TTY
execution.

Current scope:

- pricing catalog display
- pricing change planning
- pricing change publishing
- interactive publish confirmation
- script-safe `--json` output
- script-safe `--yes` publishing

This is not the production auth version yet.

The current pricing client still uses the local direct database adapter.

## 2. Where

CLI entrypoint:

- `apps/cli/src/main.ts`

Ink app:

- `apps/cli/src/App.tsx`

Pricing CLI orchestration:

- `apps/cli/src/pricing/cli.ts`

Pricing client boundary:

- `apps/cli/src/pricing/client.ts`

Current local adapter:

- `apps/cli/src/pricing/local-client.ts`

Command conversion:

- `apps/cli/src/pricing/command.ts`

CLI tests:

- `apps/cli/src/pricing/cli.test.ts`

Package/config changes:

- `apps/cli/package.json`
- `apps/cli/tsconfig.json`
- `pnpm-lock.yaml`

## 3. Why

The CLI now has two execution modes because terminal usage and script usage need
different behavior.

Interactive terminal mode can ask the operator to confirm a publish.

Script mode should not wait for keyboard input.

That is why `pricing publish` fails closed without `--yes` when the CLI is not
running through Ink.

## 4. How It Works Now

The flow is:

1. `main.ts` loads `apps/cli/.env.local`.
2. `main.ts` passes `argv`, `process.env`, `stdin`, `stdout`, and `stderr` into
   `runPricingCli`.
3. `runPricingCli` parses the pricing command.
4. `runPricingCli` creates a `PricingAdminClient`.
5. If output is JSON or stdout is not a TTY, the CLI uses plain rendering.
6. If stdout is a TTY, the CLI renders `PresslyAdminApp` with Ink.
7. The client is closed in `finally`.

The current `PricingAdminClient` has this small surface:

- `loadCatalog`
- `planChange`
- `publishChange`
- `close`

That keeps the terminal UI from knowing how pricing data is loaded or written.

## 5. Interactive Mode

Interactive mode is used when stdout is a real terminal.

`pricing show`:

- loads the catalog
- prints the formatted catalog
- exits

`pricing plan`:

- builds a proposed pricing change
- prints the diff
- exits

`pricing publish` without `--yes`:

- builds the plan first
- shows the diff
- waits for `y` or `n`
- publishes only after `y`

## 6. Script Mode

Script mode is used when:

- `--json` is passed
- stdout is not a TTY

In this mode, output stays machine-readable or plain text.

Publishing requires `--yes`.

This avoids accidental writes in automation.

Example:

```bash
pnpm admin pricing plan \
  --service wash-fold \
  --set delivery_fee=4.95 \
  --reason "Update delivery fee" \
  --json
```

Publishing from a script:

```bash
pnpm admin pricing publish \
  --service wash-fold \
  --set delivery_fee=4.95 \
  --reason "Update delivery fee" \
  --yes
```

## 7. Current Boundary

The new boundary is `PricingAdminClient`.

Right now it is backed by `makeLocalPricingAdminClient`, which connects directly
to the database through the pricing module.

Later, the same CLI shell can use an authenticated HTTP client instead.

That future change should not require the Ink UI to understand auth, API routes,
or database details.

## 8. Effect

Operators get a safer terminal flow for pricing changes.

Engineers get a cleaner split:

- argument parsing stays in the CLI layer
- rendering stays in the CLI layer
- pricing behavior stays behind `PricingAdminClient`
- the current database adapter is isolated

The CLI is now closer to a real admin tool, but production auth is still the
next required step before using it for sensitive production changes.
