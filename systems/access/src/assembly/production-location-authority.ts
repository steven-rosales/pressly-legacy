import type { PostgresDatabase } from '@pressly/postgres/client';
import type { Clock } from '@pressly/time';
import { makeReconcileProductionLocationCell } from '../cells/scopes/reconcile-production-location/cell.ts';
import { makeReconcileProductionLocationPostgresRepository } from '../cells/scopes/reconcile-production-location/postgres.ts';
import type { AccessSchema } from '../schema/public.ts';

export const makeProductionLocationAuthority = (input: {
  db: PostgresDatabase;
  schema: Pick<AccessSchema, 'businessAccounts' | 'accessProductionLocations'>;
  clock: Clock;
}) =>
  makeReconcileProductionLocationCell({
    repository: makeReconcileProductionLocationPostgresRepository(
      input.db,
      input.schema,
    ),
    clock: input.clock,
  });
