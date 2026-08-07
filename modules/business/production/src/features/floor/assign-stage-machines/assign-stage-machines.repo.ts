import { type Database, type DatabaseExecutor } from '@pressly/db/client';
import { and, eq } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import type { IdSource } from '@pressly/kernel';
import type { AssignStageMachinesRepository } from './assign-stage-machines.port.ts';
import { loadStageTransitionContext } from '../../../foundations/adapters/postgres/execution/stage-transition-context.adapter.ts';
import {
  appendWorkEvent,
  findWorkEvent,
} from '../../../foundations/adapters/postgres/commands/work-events.adapter.ts';

export const makeAssignStageMachinesRepository = (deps: {
  db: Database;
  ids: IdSource;
}): AssignStageMachinesRepository =>
  defineUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
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
