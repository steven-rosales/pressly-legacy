import type { PostgresExecutor } from '@pressly/postgres/client';
import { and, eq, inArray } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import {
  conflictError,
  invariantViolationError,
} from '@pressly/errors/factories';
import type { AdvanceStageAttemptMutation } from './types.ts';

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

export const completeAdvanceStageAttempts = async (
  db: PostgresExecutor,
  input: Readonly<{
    locationId: string;
    stageRunId: string;
    attempts: readonly AdvanceStageAttemptMutation[];
    actorId: string;
    now: Date;
  }>,
  schema: ProductionSchema,
): Promise<number> => {
  const [firstAttempt] = input.attempts;
  if (
    firstAttempt === undefined ||
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
    .update(schema.productionOrderStageAttempts)
    .set({
      status: firstAttempt.lifecycle.state,
      completedAt: input.now,
      completedBy: input.actorId,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.productionOrderStageAttempts.locationId, input.locationId),
        eq(schema.productionOrderStageAttempts.stageRunId, input.stageRunId),
        inArray(schema.productionOrderStageAttempts.id, attemptIds),
        eq(
          schema.productionOrderStageAttempts.status,
          firstAttempt.lifecycle.from,
        ),
      ),
    )
    .returning({ id: schema.productionOrderStageAttempts.id });

  if (completed.length !== input.attempts.length)
    throw productionConcurrencyConflict(
      'production_stage_attempt_version_conflict',
      'Assigned order-stage attempts changed concurrently.',
    );

  return completed.length;
};
