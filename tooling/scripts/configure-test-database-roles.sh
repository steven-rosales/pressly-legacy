#!/usr/bin/env bash
set -euo pipefail

docker compose up -d --wait postgres-test
docker compose exec -T postgres-test \
  psql \
    -U pressly \
    -d pressly_test \
    -v database_name=pressly_test \
    -v migration_password=pressly_migration_test \
    -v runtime_password=pressly_runtime_test \
    -v backup_password=pressly_backup_test \
    -f - < infra/postgres/configure-roles.sql
