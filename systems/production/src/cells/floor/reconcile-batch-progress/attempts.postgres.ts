import type { CellOutcome } from '@pressly/cells';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { and, eq, inArray } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import type { ProductionOrderStageAttemptMutation } from '../../../model/public.ts';
import type { ReconcileBatchProgressExpectedFailure } from './types.ts';

const invariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

export const completeReconciledStageAttempts = async (
  db: PostgresExecutor,
  input: Readonly<{
    locationId: string;
    stageRunId: string;
    attempts: readonly ProductionOrderStageAttemptMutation[];
    actorId: string;
    now: Date;
  }>,
  schema: ProductionSchema,
): Promise<CellOutcome<number, ReconcileBatchProgressExpectedFailure>> => {
  if (
    input.attempts.length === 0 ||
    input.attempts.some(
      (attempt) =>
        attempt.stageRunId !== input.stageRunId ||
        attempt.lifecycle.from !== 'assigned' ||
        attempt.lifecycle.state !== 'completed',
    )
  )
    throw invariant(
      'production_stage_attempt_lifecycle_invalid',
      'Stage-attempt lifecycle decisions are invalid.',
    );
  const ids = input.attempts.map((attempt) => attempt.attemptId);
  if (new Set(ids).size !== ids.length)
    throw invariant(
      'production_stage_attempt_lifecycle_duplicated',
      'Stage-attempt lifecycle decisions are duplicated.',
    );
  const completed = await db
    .update(schema.productionOrderStageAttempts)
    .set({
      status: 'completed',
      completedAt: input.now,
      completedBy: input.actorId,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.productionOrderStageAttempts.locationId, input.locationId),
        eq(schema.productionOrderStageAttempts.stageRunId, input.stageRunId),
        inArray(schema.productionOrderStageAttempts.id, ids),
        eq(schema.productionOrderStageAttempts.status, 'assigned'),
      ),
    )
    .returning({ id: schema.productionOrderStageAttempts.id });
  return completed.length === input.attempts.length
    ? { kind: 'success', value: completed.length }
    : {
        kind: 'failure',
        failure: {
          kind: 'conflict',
          code: 'production_stage_attempt_version_conflict',
          message: 'Assigned order-stage attempts changed concurrently.',
          safeMessage: 'Production state changed. Refresh and try again.',
        },
      };
};
