import {
  and,
  eq,
  laundryProduction,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import type { StartProductionRunRepository } from './start-production-run.port.ts';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';

export const makeStartProductionRunRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): StartProductionRunRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    loadRun: async (locationId, productionRunId) => {
      const [run] = await db
        .select()
        .from(laundryProduction.productionRuns)
        .where(
          and(
            eq(laundryProduction.productionRuns.locationId, locationId),
            eq(laundryProduction.productionRuns.id, productionRunId),
          ),
        )
        .limit(1);
      return run === undefined
        ? null
        : {
            id: run.id,
            status: run.status as 'planned' | 'started' | 'completed',
            version: run.version,
          };
    },
    startRun: async ({ locationId, productionRunId, expectedVersion, now }) => {
      const [run] = await db
        .update(laundryProduction.productionRuns)
        .set({
          status: 'started',
          startedAt: now,
          version: expectedVersion + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(laundryProduction.productionRuns.locationId, locationId),
            eq(laundryProduction.productionRuns.id, productionRunId),
            eq(laundryProduction.productionRuns.status, 'planned'),
            eq(laundryProduction.productionRuns.version, expectedVersion),
          ),
        )
        .returning({
          id: laundryProduction.productionRuns.id,
          version: laundryProduction.productionRuns.version,
        });
      return run === undefined
        ? null
        : { entityId: run.id, version: run.version, replayed: false };
    },
    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
