import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, eq, inArray } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import { invariantViolationError } from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import { loadOrderRouteProposalContextForUpdate } from './context.postgres.ts';
import type {
  CommitOrderRouteRepository,
  CommitOrderRouteTransactionRepository,
} from './execute.ts';
import { commitOrderRouteConcurrencyConflict } from './failures.ts';
import type { StoredCommitOrderRouteWorkEvent } from './idempotency.ts';
import type {
  CommitOrderRouteMutation,
  CommitOrderRouteMutationInput,
} from './types.ts';
import {
  appendCommitOrderRouteWorkEvent,
  findCommitOrderRouteWorkEvent,
} from './work-event.postgres.ts';

const invariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const concurrencyConflict = (
  code: string,
  message: string,
): CommitOrderRouteMutation => ({
  kind: 'conflict',
  failure: commitOrderRouteConcurrencyConflict({ code, message }),
});

const commitOrderRoute = async (
  database: PostgresExecutor,
  ids: IdSource,
  input: CommitOrderRouteMutationInput,
  schema: ProductionSchema,
): Promise<CommitOrderRouteMutation> => {
  const proposal = input.plan.proposal;
  const target = input.context.candidates.find(
    (candidate) =>
      candidate.productionBatchId === proposal.targetProductionBatchId,
  );
  if (target === undefined)
    throw invariant(
      'production_order_route_target_missing',
      'Route target is missing.',
    );

  const releasedMembership = await database
    .update(schema.productionBatchOrders)
    .set({
      active: false,
      releasedAt: input.now,
      releasedBy: input.actorId,
      releaseReason: input.reason,
    })
    .where(
      and(
        eq(schema.productionBatchOrders.id, input.context.source.membershipId),
        eq(schema.productionBatchOrders.active, true),
      ),
    )
    .returning({ id: schema.productionBatchOrders.id });
  if (releasedMembership.length !== 1)
    return concurrencyConflict(
      'production_order_route_membership_version_conflict',
      'Source order membership changed concurrently.',
    );

  const expectedReleaseAttemptIds = input.context.attempts
    .filter(
      (attempt) =>
        attempt.productionBatchId === input.context.source.productionBatchId &&
        attempt.status === 'assigned' &&
        proposal.releasedStages.includes(attempt.stage),
    )
    .map((attempt) => attempt.id);
  const releaseAttemptIds = input.plan.attemptLifecycles.map(
    (attempt) => attempt.attemptId,
  );
  if (
    expectedReleaseAttemptIds.length !== proposal.releasedStages.length ||
    releaseAttemptIds.length !== expectedReleaseAttemptIds.length ||
    expectedReleaseAttemptIds.some(
      (attemptId) => !releaseAttemptIds.includes(attemptId),
    ) ||
    input.plan.attemptLifecycles.some(
      (attempt) =>
        attempt.lifecycle.from !== 'assigned' ||
        attempt.lifecycle.state !== 'released',
    )
  )
    return concurrencyConflict(
      'production_order_route_source_attempts_conflict',
      'The unfinished source route no longer matches production.',
    );

  if (releaseAttemptIds.length > 0) {
    const [firstAttemptLifecycle] = input.plan.attemptLifecycles;
    if (firstAttemptLifecycle === undefined)
      return concurrencyConflict(
        'production_order_route_source_attempts_conflict',
        'The unfinished source route no longer matches production.',
      );
    const releasedAttempts = await database
      .update(schema.productionOrderStageAttempts)
      .set({
        status: firstAttemptLifecycle.lifecycle.state,
        releasedAt: input.now,
        releasedBy: input.actorId,
        releaseReason: input.reason,
        updatedAt: input.now,
      })
      .where(
        and(
          inArray(schema.productionOrderStageAttempts.id, releaseAttemptIds),
          eq(
            schema.productionOrderStageAttempts.status,
            firstAttemptLifecycle.lifecycle.from,
          ),
        ),
      )
      .returning({ id: schema.productionOrderStageAttempts.id });
    if (releasedAttempts.length !== releaseAttemptIds.length)
      return concurrencyConflict(
        'production_order_route_attempt_version_conflict',
        'Source route attempts changed concurrently.',
      );
  }

  await database.insert(schema.productionBatchOrders).values({
    id: ids.next(),
    locationId: input.locationId,
    productionBatchId: target.productionBatchId,
    productionOrderId: input.context.order.id,
    active: true,
    placementProvenance:
      proposal.kind === 'queued_move' ? 'manual_rebatch' : 'exception_route',
    placedAt: input.now,
    placedBy: input.actorId,
    pinnedAt: proposal.kind === 'queued_move' ? input.now : null,
    pinnedBy: proposal.kind === 'queued_move' ? input.actorId : null,
  });

  const createdAttemptIds: string[] = [];
  for (const stage of proposal.assignedStages) {
    const targetStage = target.stages.find(
      (candidate) => candidate.stage === stage,
    );
    if (targetStage === undefined)
      throw invariant(
        'production_order_route_target_stage_missing',
        `Target stage is missing: ${stage}.`,
      );

    const attemptNumber =
      Math.max(
        0,
        ...input.context.attempts
          .filter((attempt) => attempt.stage === stage)
          .map((attempt) => attempt.attemptNumber),
      ) + 1;
    const id = ids.next();
    createdAttemptIds.push(id);
    await database.insert(schema.productionOrderStageAttempts).values({
      id,
      locationId: input.locationId,
      productionRunId: input.context.run.id,
      productionOrderId: input.context.order.id,
      stageRunId: targetStage.stageRunId,
      stageKind: stage,
      attemptNumber,
      status: input.plan.initialAttemptState,
      assignmentReason: input.reason,
      assignedAt: input.now,
      assignedBy: input.actorId,
      metadata: {
        sourceProductionBatchId: input.context.source.productionBatchId,
        targetProductionBatchId: target.productionBatchId,
        ...(input.note === undefined ? {} : { note: input.note }),
      },
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  const sourceWeight =
    input.context.source.derivedWeightLbs - input.context.order.weightLbs;
  const targetWeight = target.derivedWeightLbs + input.context.order.weightLbs;
  if (sourceWeight <= 0 || targetWeight > target.pulseCapacityLbs)
    throw invariant(
      'production_order_route_capacity_invalid',
      'Route aggregate weights violate hard capacity.',
    );

  const [updatedSource] = await database
    .update(schema.productionBatches)
    .set({
      derivedWeightLbs: sourceWeight,
      version: input.context.source.version + 1,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.productionBatches.id, input.context.source.productionBatchId),
        eq(schema.productionBatches.version, input.context.source.version),
      ),
    )
    .returning({ version: schema.productionBatches.version });
  const [updatedTarget] = await database
    .update(schema.productionBatches)
    .set({
      derivedWeightLbs: targetWeight,
      version: target.version + 1,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.productionBatches.id, target.productionBatchId),
        eq(schema.productionBatches.version, target.version),
      ),
    )
    .returning({ version: schema.productionBatches.version });
  if (updatedSource === undefined || updatedTarget === undefined)
    return concurrencyConflict(
      'production_order_route_batch_version_conflict',
      'Source or target batch changed concurrently.',
    );

  const [updatedOrder] = await database
    .update(schema.productionOrders)
    .set({
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      version: input.context.order.version + 1,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.productionOrders.id, input.context.order.id),
        eq(schema.productionOrders.version, input.context.order.version),
        eq(
          schema.productionOrders.executionStatus,
          input.context.order.executionStatus,
        ),
        eq(schema.productionOrders.resolutionState, 'open'),
      ),
    )
    .returning({ version: schema.productionOrders.version });
  if (updatedOrder === undefined)
    return concurrencyConflict(
      'production_order_route_order_version_conflict',
      'Production order changed concurrently.',
    );

  const [updatedRun] = await database
    .update(schema.productionRuns)
    .set({
      queueVersion: input.context.run.queueVersion + 1,
      overtimeProposalHash: null,
      overtimeQueueVersion: null,
      overtimeAcknowledgedBy: null,
      overtimeAcknowledgedAt: null,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.productionRuns.id, input.context.run.id),
        eq(schema.productionRuns.queueVersion, input.context.run.queueVersion),
        eq(schema.productionRuns.status, 'started'),
      ),
    )
    .returning({
      queueVersion: schema.productionRuns.queueVersion,
    });
  if (updatedRun === undefined)
    return concurrencyConflict(
      'production_order_route_queue_version_conflict',
      'Production queue changed concurrently.',
    );

  return {
    kind: 'saved',
    result: {
      status: 'routed',
      proposal,
      queueVersion: updatedRun.queueVersion,
      orderVersion: updatedOrder.version,
      sourceBatchVersion: updatedSource.version,
      targetBatchVersion: updatedTarget.version,
      createdAttemptIds,
      replayed: false,
    },
  };
};

export type CommitOrderRoutePostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makeCommitOrderRoutePostgresRepository = (
  dependencies: CommitOrderRoutePostgresDependencies,
  schema: ProductionSchema,
): CommitOrderRouteRepository<StoredCommitOrderRouteWorkEvent> => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    dependencies.db,
    (
      database: PostgresExecutor,
    ): CommitOrderRouteTransactionRepository<StoredCommitOrderRouteWorkEvent> => ({
      findWorkEvent: (key) =>
        findCommitOrderRouteWorkEvent(database, schema, key),
      loadContextForUpdate: (input) =>
        loadOrderRouteProposalContextForUpdate(database, input, schema),
      commit: (input) =>
        commitOrderRoute(database, dependencies.ids, input, schema),
      appendWorkEvent: (event) =>
        appendCommitOrderRouteWorkEvent(
          database,
          schema,
          dependencies.ids,
          event,
        ),
    }),
  );
  const unitOfWork =
    dependencies.observeUnitOfWork?.(nativeUnitOfWork) ?? nativeUnitOfWork;

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
