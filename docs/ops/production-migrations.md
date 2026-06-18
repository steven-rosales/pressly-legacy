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
git diff origin/main...HEAD -- packages/db/src/migrations
rg -n "drop table|drop column|rename column|rename table|truncate|delete from" packages/db/src/migrations
```

If either command shows destructive SQL, pause and use the destructive
checklist.

## Current Production Deploy Behavior

The Lightsail deploy script runs:

```txt
docker compose build
docker compose run --rm api pnpm -F @pressly/db migrate
docker compose up -d --remove-orphans --wait
health checks
```

So migrations happen before the new containers are serving traffic.

That is acceptable only because normal migrations are expected to be
backward-compatible with the currently running containers.
