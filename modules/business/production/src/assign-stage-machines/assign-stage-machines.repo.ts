import {
  and,
  eq,
  laundryProduction,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import type { AssignStageMachinesRepository } from './assign-stage-machines.port.ts';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import { loadStageTransitionContext } from '../persistence/stage-transition-context.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';

export const makeAssignStageMachinesRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): AssignStageMachinesRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    loadStageTransitionContext: (locationId, stageRunId) =>
      loadStageTransitionContext(db, locationId, stageRunId),
    assignStageMachines: async ({
      locationId,
      stageRunId,
      expectedVersion,
      machineIds,
      now,
    }) => {
      const [stage] = await db
        .select()
        .from(laundryProduction.stageRuns)
        .where(
          and(
            eq(laundryProduction.stageRuns.locationId, locationId),
            eq(laundryProduction.stageRuns.id, stageRunId),
          ),
        )
        .limit(1);
      if (
        stage === undefined ||
        stage.status !== 'planned' ||
        stage.version !== expectedVersion
      )
        return null;
      await db
        .delete(laundryProduction.stageMachineAssignments)
        .where(
          and(
            eq(
              laundryProduction.stageMachineAssignments.locationId,
              locationId,
            ),
            eq(
              laundryProduction.stageMachineAssignments.stageRunId,
              stageRunId,
            ),
          ),
        );
      await db.insert(laundryProduction.stageMachineAssignments).values(
        machineIds.map((machineId) => ({
          id: deps.ids.next(),
          locationId,
          stageRunId,
          machineId,
          plannedStartAt: stage.plannedStartAt,
          plannedEndAt: stage.plannedEndAt,
          status: 'planned',
          createdAt: now,
          updatedAt: now,
        })),
      );
      const [updated] = await db
        .update(laundryProduction.stageRuns)
        .set({ version: expectedVersion + 1, updatedAt: now })
        .where(
          and(
            eq(laundryProduction.stageRuns.locationId, locationId),
            eq(laundryProduction.stageRuns.id, stageRunId),
            eq(laundryProduction.stageRuns.version, expectedVersion),
          ),
        )
        .returning({
          id: laundryProduction.stageRuns.id,
          version: laundryProduction.stageRuns.version,
        });
      return updated === undefined
        ? null
        : { entityId: updated.id, version: updated.version, replayed: false };
    },
    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
