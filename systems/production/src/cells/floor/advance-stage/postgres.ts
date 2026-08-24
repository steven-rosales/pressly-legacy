import type { CellOutcome } from '@pressly/cells';
import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, eq, sql } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import { invariantViolationError } from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import type { ResultUnitOfWork } from '@pressly/cells/unit-of-work';
import { completeAdvanceStageAttempts } from './complete-attempts.postgres.ts';
import { completeAdvanceStageBatch } from './complete-batch.postgres.ts';
import type {
  AdvanceStageRepository,
  AdvanceStageTransactionRepository,
  AdvanceStageTransitionInput,
} from './execute.ts';
import type { StoredAdvanceStageWorkEvent } from './idempotency.ts';
import { loadAdvanceStageFacts } from './load-facts.postgres.ts';
import type {
  AdvanceStageExpectedFailure,
  AdvanceStageMutationResult,
} from './types.ts';
import {
  appendAdvanceStageWorkEvent,
  findAdvanceStageWorkEvent,
} from './work-event.postgres.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const concurrencyConflict = (
  code: string,
  message: string,
  safeMessage = 'Production state changed. Refresh and try again.',
): AdvanceStageExpectedFailure => ({
  kind: 'conflict',
  code,
  message,
  safeMessage,
});

const transitionAdvanceStage = async (
  db: PostgresExecutor,
  input: AdvanceStageTransitionInput,
  schema: ProductionSchema,
): Promise<
  CellOutcome<AdvanceStageMutationResult, AdvanceStageExpectedFailure>
> => {
  const [stage] = await db
    .update(schema.stageRuns)
    .set({
      status: input.stageLifecycle.state,
      version: input.expectedVersion + 1,
      updatedAt: input.now,
      ...(input.stageLifecycle.state === 'started'
        ? {
            actualStartAt: input.now,
            actualStartProvenance: 'live_observed' as const,
            startedBy: input.actorId,
          }
        : {
            actualEndAt: input.now,
            actualEndProvenance: 'live_observed' as const,
            completedBy: input.actorId,
          }),
    })
    .where(
      and(
        eq(schema.stageRuns.locationId, input.locationId),
        eq(schema.stageRuns.id, input.stageRunId),
        eq(schema.stageRuns.version, input.expectedVersion),
        eq(schema.stageRuns.status, input.stageLifecycle.from),
      ),
    )
    .returning();
  if (stage === undefined)
    return {
      kind: 'failure',
      failure: concurrencyConflict(
        'stage_run_version_conflict',
        'The production stage changed before the command.',
        'The production stage changed before the command.',
      ),
    };

  const assignments = await db
    .select({
      id: schema.stageMachineAssignments.id,
      status: schema.stageMachineAssignments.status,
    })
    .from(schema.stageMachineAssignments)
    .where(
      and(
        eq(schema.stageMachineAssignments.locationId, input.locationId),
        eq(schema.stageMachineAssignments.stageRunId, input.stageRunId),
      ),
    );
  const expectedAssignmentStatus =
    input.stageLifecycle.state === 'started' ? 'planned' : 'active';
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
    .update(schema.stageMachineAssignments)
    .set({
      status: input.stageLifecycle.state === 'started' ? 'active' : 'completed',
      ...(input.stageLifecycle.state === 'started'
        ? { actualStartAt: input.now }
        : { actualEndAt: input.now }),
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.stageMachineAssignments.locationId, input.locationId),
        eq(schema.stageMachineAssignments.stageRunId, input.stageRunId),
        eq(schema.stageMachineAssignments.status, expectedAssignmentStatus),
      ),
    )
    .returning({ id: schema.stageMachineAssignments.id });
  if (updatedAssignments.length !== assignments.length)
    return {
      kind: 'failure',
      failure: concurrencyConflict(
        'production_stage_machine_assignment_version_conflict',
        'Stage machine assignments changed concurrently.',
      ),
    };

  const anchorsMutableQueue =
    input.stageLifecycle.state === 'started' &&
    input.batchLifecycle?.from === 'queued';
  const nextBatchState = input.batchLifecycle?.state ?? input.batchState;
  const [updatedBatch] = await db
    .update(schema.productionBatches)
    .set({
      status: nextBatchState,
      version: input.batchExpectedVersion + 1,
      updatedAt: input.now,
      ...(input.batchLifecycle?.from === 'queued'
        ? { startedAt: input.now }
        : {}),
      ...(anchorsMutableQueue && input.freezeMembership
        ? {
            membershipFrozenAt: input.now,
            membershipFrozenBy: input.actorId,
          }
        : {}),
      ...(nextBatchState === 'finished' ? { finishedAt: input.now } : {}),
    })
    .where(
      and(
        eq(schema.productionBatches.locationId, input.locationId),
        eq(schema.productionBatches.id, input.batchId),
        eq(schema.productionBatches.version, input.batchExpectedVersion),
        eq(
          schema.productionBatches.status,
          input.batchLifecycle?.from ?? input.batchState,
        ),
      ),
    )
    .returning();
  if (updatedBatch === undefined)
    return {
      kind: 'failure',
      failure: concurrencyConflict(
        'production_stage_batch_version_conflict',
        'Production batch changed during stage transition.',
      ),
    };

  if (anchorsMutableQueue) {
    const [updatedRunQueue] = await db
      .update(schema.productionRuns)
      .set({
        queueVersion: sql`${schema.productionRuns.queueVersion} + 1`,
        overtimeProposalHash: null,
        overtimeQueueVersion: null,
        overtimeAcknowledgedBy: null,
        overtimeAcknowledgedAt: null,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(schema.productionRuns.locationId, input.locationId),
          eq(schema.productionRuns.id, updatedBatch.productionRunId),
          eq(schema.productionRuns.status, 'started'),
        ),
      )
      .returning({ id: schema.productionRuns.id });
    if (updatedRunQueue === undefined)
      return {
        kind: 'failure',
        failure: concurrencyConflict(
          'production_stage_run_version_conflict',
          'Production run changed during stage transition.',
        ),
      };
  }

  if (input.stageLifecycle.state === 'completed') {
    await completeAdvanceStageAttempts(
      db,
      {
        locationId: input.locationId,
        stageRunId: stage.id,
        attempts: input.attemptLifecycles,
        actorId: input.actorId,
        now: input.now,
      },
      schema,
    );
  }

  if (
    input.stageLifecycle.state === 'completed' &&
    stage.stageKind === 'folding_packaging'
  ) {
    if (input.terminalLifecycle === null)
      throw productionInvariantViolation(
        'production_stage_terminal_lifecycle_missing',
        'Terminal lifecycle decisions are missing.',
      );
    await completeAdvanceStageBatch(
      db,
      {
        locationId: input.locationId,
        productionBatchId: updatedBatch.id,
        productionRunId: updatedBatch.productionRunId,
        lifecycle: input.terminalLifecycle,
        now: input.now,
      },
      schema,
    );
  }

  return {
    kind: 'success',
    value: { entityId: stage.id, version: stage.version, replayed: false },
  };
};

export type AdvanceStagePostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: <Operations>(
    unitOfWork: ResultUnitOfWork<Operations>,
  ) => ResultUnitOfWork<Operations>;
}>;

export const makeAdvanceStagePostgresRepository = (
  deps: AdvanceStagePostgresDependencies,
  schema: ProductionSchema,
): AdvanceStageRepository<StoredAdvanceStageWorkEvent> => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    deps.db,
    (
      db: PostgresExecutor,
    ): AdvanceStageTransactionRepository<StoredAdvanceStageWorkEvent> => ({
      findWorkEvent: (idempotencyKey) =>
        findAdvanceStageWorkEvent(db, schema, idempotencyKey),
      loadStageTransitionFacts: (locationId, stageRunId) =>
        loadAdvanceStageFacts(db, locationId, stageRunId, schema),
      transitionStage: (input) => transitionAdvanceStage(db, input, schema),
      appendWorkEvent: (event) =>
        appendAdvanceStageWorkEvent(db, schema, deps.ids, event),
    }),
  );
  const unitOfWork =
    deps.observeUnitOfWork?.(nativeUnitOfWork) ?? nativeUnitOfWork;

  return Object.freeze({
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
  });
};
