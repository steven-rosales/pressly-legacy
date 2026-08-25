# Production Migrations

Production deploys run database migrations before the app containers are
restarted.

That means app rollback only works cleanly when the new database shape still
works with the previous code.

## Default Rule

Normal production migrations must be additive and backward-compatible.

The safe default is:

```txt
expand first
deploy code that can read both shapes
backfill data
switch reads to the new shape
remove the old shape later during a planned cleanup
```

Do not treat code rollback as database rollback. If a bad migration reaches
production, the normal fix is a forward migration or a restore drill, not
guessing at reverse SQL during an incident.

## One-Time Pre-User Clean Epoch

Pressly used one explicit exception before customer production data existed:
the compatibility-era non-Pricing schema and migration history were replaced
by a clean owner-local baseline. Pricing was excluded from the destructive
scope and had to retain its schema, catalog values, contracts, seed behavior,
and public rendering exactly.

This was a coordinated database-epoch cutover, not a normal deploy or a
precedent for rewriting history. It required fenced writers, recoverable old
database and migration artifacts, a fresh backup and restore proof, a clean
database apply from `template0`, exact Pricing equivalence, role verification,
and full application/runtime proof. Backups from before the cutover remain
paired with the old release and ledger.

After that cutover, the clean-epoch ledger is immutable and append-only. All
future production changes follow the additive guidance below unless a new,
explicitly approved breaking-release plan satisfies the destructive
checklist.

## Allowed In Normal Deploys

These are normally safe because old and new app versions can keep running:

```txt
create table
add nullable column
add column with a safe default
add enum value when old code can ignore it
add non-breaking constraint after existing data is valid
create a new index
create index concurrently when supported
```

Still review generated SQL before deploying. The rule is about production
compatibility, not just the migration command succeeding.

## Not Allowed In Normal Deploys

These need a separate plan because they can break rollback or destroy data:

```txt
drop table
drop column
rename table
rename column
change column type destructively
truncate
delete production data
make a nullable column required without a backfill plan
add a constraint before existing data is valid
```

## Destructive Checklist

Use this checklist before any destructive production migration:

```txt
maintenance window chosen
fresh encrypted backup completed
restore command ready
exact app release known
manual approval from owner/operator
forward-fix plan written
rollback expectation stated clearly
```

The key point: if the migration destroys or rewrites data, rollback may mean a
database restore, not just `rollback.sh`.

## Expand-Contract Example

Bad:

```txt
rename column full_name to display_name in one deploy
```

Why it is bad: if the new app fails and the old app comes back, the old app
still expects `full_name`.

Better:

```txt
deploy 1: add nullable display_name
deploy 2: write both full_name and display_name
deploy 3: backfill display_name from full_name
deploy 4: read display_name, with full_name fallback if needed
later maintenance: drop full_name
```

This costs more steps, but it keeps rollback boring.

## Pre-Deploy Review

Before a production deploy with new migrations:

```bash
git diff origin/main...HEAD -- platform/postgres/migrations
rg -n "drop table|drop column|rename column|rename table|truncate|delete from" platform/postgres/migrations
```

If either command shows destructive SQL, pause and use the destructive
checklist.

## Current Production Deploy Behavior

`deploy/aws/lightsail/deploy.sh` deploys artifacts built and verified by CI. The
server does not rebuild application images.

The release sequence is:

```txt
validate the release manifest and Compose configuration
check out the exact verified source SHA
pull immutable API, Web, Worker, Processor, and Control image digests
verify each image revision label against the source SHA
run the tools-profile migrate service with migration-only credentials
docker compose up -d --remove-orphans --wait
verify Compose state and application health endpoints
```

The deploy script runs the canonical Pressly migration wrapper from the
immutable API image with the production Compose file and environment selected
explicitly. The wrapper verifies the current clean-epoch history and applied
ledger before and after migration:

```bash
docker compose \
  --profile tools \
  --env-file "$COMPOSE_ENV_FILE" \
  -f "$COMPOSE_FILE" \
  run --rm --workdir /repo migrate \
  node --import tsx tooling/postgres/migrate.ts
```

This is the invocation inside `deploy/aws/lightsail/deploy.sh`; operators should
run the deploy workflow rather than paste it from the repository root without
those production selectors.

The `migrate` service is not the API runtime container. It is a read-only tool
container with its own migration environment and database role. Migrations run
before the new application containers serve traffic.

That is acceptable only because normal migrations are expected to be
backward-compatible with the currently running containers.

## Coordinated Breaking Releases

An intentionally breaking migration is not a normal deploy. Treat the
migration, contracts, API, Worker, and Processor as one release unit.

Before approving it, record:

1. Why expand-contract cannot provide the required transition.
2. The exact preflight that proves existing data is migratable or aborts
   without mutation.
3. The tested migration and application versions that must move together.
4. Whether rollback is a forward fix, an application rollback, or a database
   restore. Never imply that all three are interchangeable.
5. A fresh backup and completed restore drill for any destructive or
   irreversible rewrite.
6. The integration and end-to-end proof that crosses the migrated boundary.

Do not make a breaking release routine merely because one has been coordinated
successfully. Additive, backward-compatible migrations remain the default.
