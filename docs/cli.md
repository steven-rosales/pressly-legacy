# CLI

The admin CLI is a normal host plus a direct topology composition:

```text
hosts/cli/src/main.ts
  -> topology/cli.ts
  -> topology/runtime/cli/catalog.ts
  -> topology/runtime/cli/composition.ts
  -> platform/jobs, platform/postgres, and owner operations
```

The host owns process effects:

- argv and environment;
- stdin/stdout and prompts;
- session files;
- signals and exit codes; and
- database lifecycle.

Topology owns which CLI cells are assembled. The CLI host does not import
Systems or Experiences directly and does not contain business selection logic.

## Run locally

```bash
pnpm admin:env -- --help
pnpm admin -- --help
```

For a local database, copy the environment template, start PostgreSQL, and
run the migrations first:

```bash
pnpm docker:postgres:up
pnpm db:migrate
pnpm admin -- --help
```

The CLI is also used by the owner bootstrap commands:

```bash
pnpm auth:bootstrap:owner -- --help
pnpm production:bootstrap -- --help
```

## Traversal

Start at `hosts/cli/src/main.ts`. The direct composition root supplies:

- `makeCliCatalogFromOwners` from
  `topology/runtime/cli/catalog.ts`;
- `presslyPostgresSchema` through `topology/database.ts`; and
- the selected runtime invocation from `topology/runtime/cli/composition.ts`.

Then follow the command's versioned operation ID into the owning cell:

```text
command name
  -> CLI surface in the owning cell's cell.ts
  -> contract.ts
  -> execute.ts / decide.ts
  -> postgres.ts or owner capability
```

The CLI catalog is intentionally a small typed view over the executable owner
assemblies. It is not a second command implementation and it is not generated.

## Adding a command

1. Put the operation in the System or Experience that owns its meaning.
2. Add the CLI surface and typed contract in that operation's cell.
3. Add the executor and local proof.
4. Expose the operation through the owning public assembly.
5. Select it in `topology/runtime/cli/catalog.ts` if this deployment should run
   it.
6. Run the CLI host tests, typecheck, lint, and the architecture gates.

Do not add a command registry in the host, a second parser, or a compatibility
alias. If a command needs a new process effect, add that effect to the CLI host
and inject the derived capability into the owner operation.
