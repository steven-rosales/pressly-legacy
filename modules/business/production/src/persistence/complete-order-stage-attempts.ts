import {
  and,
  eq,
  inArray,
  laundryProduction,
  type DatabaseExecutor,
} from '@pressly/db';
import { conflictError, invariantViolationError } from '@pressly/errors';
import type { ProductionOrderStageAttemptMutation } from '../production-lifecycle/production-lifecycle.model.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const productionConcurrencyConflict = (code: string, message: string) =>
  conflictError({
    code,
    message,
    safeMessage: 'Production state changed. Refresh and try again.',
  });

export const completeAssignedOrderStageAttempts = async (
  db: DatabaseExecutor,
  input: Readonly<{
    locationId: string;
    stageRunId: string;
    attempts: readonly ProductionOrderStageAttemptMutation[];
    actorId: string;
    now: Date;
  }>,
): Promise<number> => {
  if (
    input.attempts.length === 0 ||
    input.attempts.some(
      (attempt) =>
        attempt.stageRunId !== input.stageRunId ||
        attempt.lifecycle.from !== 'assigned' ||
        attempt.lifecycle.state !== 'completed',
    )
  )
    throw productionInvariantViolation(
      'production_stage_attempt_lifecycle_invalid',
      'Stage-attempt lifecycle decisions are invalid.',
    );

  const attemptIds = input.attempts.map((attempt) => attempt.attemptId);
  if (new Set(attemptIds).size !== attemptIds.length)
    throw productionInvariantViolation(
      'production_stage_attempt_lifecycle_duplicated',
      'Stage-attempt lifecycle decisions are duplicated.',
    );

  const completed = await db
    .update(laundryProduction.productionOrderStageAttempts)
    .set({
      status: input.attempts[0]!.lifecycle.state,
      completedAt: input.now,
      completedBy: input.actorId,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(
          laundryProduction.productionOrderStageAttempts.locationId,
          input.locationId,
        ),
        eq(
          laundryProduction.productionOrderStageAttempts.stageRunId,
          input.stageRunId,
        ),
        inArray(laundryProduction.productionOrderStageAttempts.id, attemptIds),
        eq(
          laundryProduction.productionOrderStageAttempts.status,
          input.attempts[0]!.lifecycle.from,
        ),
      ),
    )
    .returning({ id: laundryProduction.productionOrderStageAttempts.id });

  if (completed.length !== input.attempts.length)
    throw productionConcurrencyConflict(
      'production_stage_attempt_version_conflict',
      'Assigned order-stage attempts changed concurrently.',
    );

  return completed.length;
};
