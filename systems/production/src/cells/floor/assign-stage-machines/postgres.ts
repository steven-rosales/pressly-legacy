import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import type {
  AssignStageMachinesRepository,
  AssignStageMachinesTransactionRepository,
} from './execute.ts';
import type { StoredAssignStageMachinesWorkEvent } from './idempotency.ts';
import { loadAssignStageMachinesContext } from './load-context.postgres.ts';
import {
  appendAssignStageMachinesWorkEvent,
  findAssignStageMachinesWorkEvent,
} from './work-event.postgres.ts';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';

export type AssignStageMachinesPostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makeAssignStageMachinesPostgresRepository = (
  deps: AssignStageMachinesPostgresDependencies,
  schema: ProductionSchema,
): AssignStageMachinesRepository<StoredAssignStageMachinesWorkEvent> => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    deps.db,
    (
      db: PostgresExecutor,
    ): AssignStageMachinesTransactionRepository<StoredAssignStageMachinesWorkEvent> => ({
      findWorkEvent: (key) => findAssignStageMachinesWorkEvent(db, schema, key),
      loadStageTransitionContext: (locationId, stageRunId) =>
        loadAssignStageMachinesContext(db, locationId, stageRunId, schema),
      assignStageMachines: async ({
        locationId,
        stageRunId,
        expectedVersion,
        machineIds,
        now,
      }) => {
        const [stage] = await db
          .select()
          .from(schema.stageRuns)
          .where(
            and(
              eq(schema.stageRuns.locationId, locationId),
              eq(schema.stageRuns.id, stageRunId),
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
          .delete(schema.stageMachineAssignments)
          .where(
            and(
              eq(schema.stageMachineAssignments.locationId, locationId),
              eq(schema.stageMachineAssignments.stageRunId, stageRunId),
            ),
          );
        await db.insert(schema.stageMachineAssignments).values(
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
          .update(schema.stageRuns)
          .set({ version: expectedVersion + 1, updatedAt: now })
          .where(
            and(
              eq(schema.stageRuns.locationId, locationId),
              eq(schema.stageRuns.id, stageRunId),
              eq(schema.stageRuns.version, expectedVersion),
            ),
          )
          .returning({
            entityId: schema.stageRuns.id,
            version: schema.stageRuns.version,
          });
        return updated === undefined
          ? null
          : { ...updated, replayed: false as const };
      },
      appendWorkEvent: (event) =>
        appendAssignStageMachinesWorkEvent(db, schema, deps.ids, event),
    }),
  );
  const unitOfWork =
    deps.observeUnitOfWork?.(nativeUnitOfWork) ?? nativeUnitOfWork;
  return {
    transaction: async (work) => {
      const outcome = await unitOfWork.transaction(async (repository) => {
        const cellOutcome = await work(repository);
        return cellOutcome.kind === 'success'
          ? result.ok(cellOutcome.value)
          : result.err(cellOutcome.failure);
      });
      return outcome.tag === 'ok'
        ? { kind: 'success', value: outcome.value }
        : { kind: 'failure', failure: outcome.error };
    },
  };
};
