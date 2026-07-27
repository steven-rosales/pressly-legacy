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
      stageLifecycle,
      batchId,
      batchExpectedVersion,
      batchState,
      batchLifecycle,
      freezeMembership,
      attemptLifecycles,
      terminalLifecycle,
      actorId,
      now,
    }) => {
      const [stage] = await db
        .update(laundryProduction.stageRuns)
        .set({
          status: stageLifecycle.state,
          version: expectedVersion + 1,
          updatedAt: now,
          ...(stageLifecycle.state === 'started'
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
            eq(laundryProduction.stageRuns.status, stageLifecycle.from),
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
        stageLifecycle.state === 'started' ? 'planned' : 'active';
      if (
        assignments.some(
          (assignment) => assignment.status !== expectedAssignmentStatus,
        )
      )
        throw new Error('Stage machine assignment state is inconsistent.');

      const updatedAssignments = await db
        .update(laundryProduction.stageMachineAssignments)
        .set({
          status: stageLifecycle.state === 'started' ? 'active' : 'completed',
          ...(stageLifecycle.state === 'started'
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

      const anchorsMutableQueue =
        stageLifecycle.state === 'started' && batchLifecycle?.from === 'queued';
      const nextBatchState = batchLifecycle?.state ?? batchState;
      const [updatedBatch] = await db
        .update(laundryProduction.productionBatches)
        .set({
          status: nextBatchState,
          version: batchExpectedVersion + 1,
          updatedAt: now,
          ...(batchLifecycle?.from === 'queued' ? { startedAt: now } : {}),
          ...(anchorsMutableQueue && freezeMembership
            ? {
                membershipFrozenAt: now,
                membershipFrozenBy: actorId,
              }
            : {}),
          ...(nextBatchState === 'finished' ? { finishedAt: now } : {}),
        })
        .where(
          and(
            eq(laundryProduction.productionBatches.locationId, locationId),
            eq(laundryProduction.productionBatches.id, batchId),
            eq(
              laundryProduction.productionBatches.version,
              batchExpectedVersion,
            ),
            eq(
              laundryProduction.productionBatches.status,
              batchLifecycle?.from ?? batchState,
            ),
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
              eq(
                laundryProduction.productionRuns.id,
                updatedBatch.productionRunId,
              ),
              eq(laundryProduction.productionRuns.status, 'started'),
            ),
          )
          .returning({ id: laundryProduction.productionRuns.id });
        if (updatedRunQueue === undefined)
          throw new Error('Production run changed during stage transition.');
      }

      if (stageLifecycle.state === 'completed')
        await completeAssignedOrderStageAttempts(db, {
          locationId,
          stageRunId: stage.id,
          attempts: attemptLifecycles,
          actorId,
          now,
        });

      if (
        stageLifecycle.state === 'completed' &&
        stage.stageKind === 'folding_packaging'
      ) {
        if (terminalLifecycle === null)
          throw new Error('Terminal lifecycle decisions are missing.');
        await completeProductionBatch(db, {
          locationId,
          productionBatchId: updatedBatch.id,
          productionRunId: updatedBatch.productionRunId,
          lifecycle: terminalLifecycle,
          now,
        });
      }

      return { entityId: stage.id, version: stage.version, replayed: false };
    },
    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
