import { invariantViolationError } from '@pressly/errors/factories';
import { and, eq, sql } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { conflictFailure } from '../../../foundations/language/failures/production-failure.factory.ts';
import type { Database, DatabaseExecutor } from '@pressly/db/client';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import type { IdSource } from '@pressly/kernel';
import type { AdvanceProductionStageRepository } from './advance-production-stage.port.ts';
import { loadStageTransitionContext } from '../../../foundations/adapters/postgres/execution/stage-transition-context.adapter.ts';
import {
  appendWorkEvent,
  findWorkEvent,
} from '../../../foundations/adapters/postgres/commands/work-events.adapter.ts';
import { completeProductionBatch } from '../../../foundations/adapters/postgres/execution/complete-production-batch.adapter.ts';
import { completeAssignedOrderStageAttempts } from '../../../foundations/adapters/postgres/execution/complete-order-stage-attempts.adapter.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const productionConcurrencyConflict = (code: string, message: string) =>
  conflictFailure({
    code,
    message,
    safeMessage: 'Production state changed. Refresh and try again.',
  });

export const makeAdvanceProductionStageRepository = (deps: {
  db: Database;
  ids: IdSource;
}): AdvanceProductionStageRepository =>
  defineUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
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
        throw productionInvariantViolation(
          'production_stage_machine_assignment_state_invalid',
          'Stage machine assignment state is inconsistent.',
        );

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
        throw productionConcurrencyConflict(
          'production_stage_machine_assignment_version_conflict',
          'Stage machine assignments changed concurrently.',
        );

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
        throw productionConcurrencyConflict(
          'production_stage_batch_version_conflict',
          'Production batch changed during stage transition.',
        );

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
          throw productionConcurrencyConflict(
            'production_stage_run_version_conflict',
            'Production run changed during stage transition.',
          );
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
          throw productionInvariantViolation(
            'production_stage_terminal_lifecycle_missing',
            'Terminal lifecycle decisions are missing.',
          );
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
