import {
  and,
  eq,
  laundryProduction,
  sql,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import type { AdvanceProductionStageRepository } from './advance-production-stage.port.ts';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import { loadStageTransitionContext } from '../persistence/stage-transition-context.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';
import { completeProductionBatch } from '../persistence/complete-production-batch.ts';
import { completeAssignedOrderStageAttempts } from '../persistence/complete-order-stage-attempts.ts';

export const makeAdvanceProductionStageRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): AdvanceProductionStageRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    loadStageTransitionContext: (locationId, stageRunId) =>
      loadStageTransitionContext(db, locationId, stageRunId),
    transitionStage: async ({
      locationId,
      stageRunId,
      expectedVersion,
      nextState,
      actorId,
      now,
    }) => {
      const [stage] = await db
        .update(laundryProduction.stageRuns)
        .set({
          status: nextState,
          version: expectedVersion + 1,
          updatedAt: now,
          ...(nextState === 'started'
            ? {
                actualStartAt: now,
                actualStartProvenance: 'live_observed',
                startedBy: actorId,
              }
            : {
                actualEndAt: now,
                actualEndProvenance: 'live_observed',
                completedBy: actorId,
              }),
        })
        .where(
          and(
            eq(laundryProduction.stageRuns.locationId, locationId),
            eq(laundryProduction.stageRuns.id, stageRunId),
            eq(laundryProduction.stageRuns.version, expectedVersion),
          ),
        )
        .returning();
      if (stage === undefined) return null;

      const assignments = await db
        .select({
          id: laundryProduction.stageMachineAssignments.id,
          status: laundryProduction.stageMachineAssignments.status,
        })
        .from(laundryProduction.stageMachineAssignments)
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
      const expectedAssignmentStatus =
        nextState === 'started' ? 'planned' : 'active';
      if (
        assignments.some(
          (assignment) => assignment.status !== expectedAssignmentStatus,
        )
      )
        throw new Error('Stage machine assignment state is inconsistent.');

      const updatedAssignments = await db
        .update(laundryProduction.stageMachineAssignments)
        .set({
          status: nextState === 'started' ? 'active' : 'completed',
          ...(nextState === 'started'
            ? { actualStartAt: now }
            : { actualEndAt: now }),
          updatedAt: now,
        })
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
            eq(
              laundryProduction.stageMachineAssignments.status,
              expectedAssignmentStatus,
            ),
          ),
        )
        .returning({ id: laundryProduction.stageMachineAssignments.id });
      if (updatedAssignments.length !== assignments.length)
        throw new Error('Stage machine assignments changed concurrently.');

      const [batch] = await db
        .select()
        .from(laundryProduction.productionBatches)
        .where(
          and(
            eq(laundryProduction.productionBatches.locationId, locationId),
            eq(laundryProduction.productionBatches.id, stage.productionBatchId),
          ),
        )
        .limit(1);
      if (batch === undefined) throw new Error('Batch not found.');
      const anchorsMutableQueue =
        nextState === 'started' && batch.status === 'queued';
      const [updatedBatch] = await db
        .update(laundryProduction.productionBatches)
        .set({
          status:
            nextState === 'started'
              ? stage.stageKind
              : stage.stageKind === 'folding_packaging'
                ? 'finished'
                : batch.status,
          version: batch.version + 1,
          updatedAt: now,
          ...(nextState === 'started' && batch.startedAt === null
            ? { startedAt: now }
            : {}),
          ...(anchorsMutableQueue
            ? {
                membershipFrozenAt: batch.membershipFrozenAt ?? now,
                membershipFrozenBy: batch.membershipFrozenBy ?? actorId,
              }
            : {}),
          ...(nextState === 'completed' &&
          stage.stageKind === 'folding_packaging'
            ? { finishedAt: now }
            : {}),
        })
        .where(
          and(
            eq(laundryProduction.productionBatches.locationId, locationId),
            eq(laundryProduction.productionBatches.id, batch.id),
            eq(laundryProduction.productionBatches.version, batch.version),
          ),
        )
        .returning();
      if (updatedBatch === undefined)
        throw new Error('Production batch changed during stage transition.');

      if (anchorsMutableQueue) {
        const [updatedRunQueue] = await db
          .update(laundryProduction.productionRuns)
          .set({
            queueVersion: sql`${laundryProduction.productionRuns.queueVersion} + 1`,
            overtimeProposalHash: null,
            overtimeQueueVersion: null,
            overtimeAcknowledgedBy: null,
            overtimeAcknowledgedAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(laundryProduction.productionRuns.locationId, locationId),
              eq(laundryProduction.productionRuns.id, batch.productionRunId),
              eq(laundryProduction.productionRuns.status, 'started'),
            ),
          )
          .returning({ id: laundryProduction.productionRuns.id });
        if (updatedRunQueue === undefined)
          throw new Error('Production run changed during stage transition.');
      }

      if (nextState === 'completed')
        await completeAssignedOrderStageAttempts(db, {
          locationId,
          stageRunId: stage.id,
          actorId,
          now,
        });

      if (nextState === 'completed' && stage.stageKind === 'folding_packaging')
        await completeProductionBatch(db, {
          locationId,
          productionBatchId: batch.id,
          productionRunId: batch.productionRunId,
          now,
        });

      return { entityId: stage.id, version: stage.version, replayed: false };
    },
    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
