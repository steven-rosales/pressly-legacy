import { invariantViolationError } from '@pressly/errors/factories';
import { and, asc, eq, inArray } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { conflictFailure } from '../../../foundations/language/failures/production-failure.factory.ts';
import type { Database, DatabaseExecutor } from '@pressly/db/client';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import type { IdSource } from '@pressly/kernel';
import {
  appendWorkEvent,
  findWorkEvent,
} from '../../../foundations/adapters/postgres/commands/work-events.adapter.ts';
import type {
  CommitProductionOrderRouteInput,
  ProductionOrderRoutingContext,
  RouteProductionOrderRepository,
} from './route-production-order.port.ts';
import type { CommitProductionOrderRouteResult } from './route-production-order.model.ts';

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

const asStage = (
  value: string,
): ProductionOrderRoutingContext['attempts'][number]['stage'] => {
  switch (value) {
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding_packaging':
      return value;
    default:
      throw productionInvariantViolation(
        'production_order_route_stage_invalid',
        `Unknown production stage: ${value}.`,
      );
  }
};

const asStageStatus = (
  value: string,
): ProductionOrderRoutingContext['candidates'][number]['stages'][number]['status'] => {
  switch (value) {
    case 'planned':
    case 'started':
    case 'completed':
      return value;
    default:
      throw productionInvariantViolation(
        'production_order_route_stage_status_invalid',
        `Unknown stage-run status: ${value}.`,
      );
  }
};

const asAttemptStatus = (
  value: string,
): ProductionOrderRoutingContext['attempts'][number]['status'] => {
  switch (value) {
    case 'assigned':
    case 'completed':
    case 'released':
      return value;
    default:
      throw productionInvariantViolation(
        'production_order_route_attempt_status_invalid',
        `Unknown order-stage attempt status: ${value}.`,
      );
  }
};

const loadContext = async (
  db: DatabaseExecutor,
  locationId: string,
  productionRunId: string,
  productionOrderId: string,
  lock: boolean,
): Promise<ProductionOrderRoutingContext | null> => {
  const runQuery = db
    .select({
      id: laundryProduction.productionRuns.id,
      status: laundryProduction.productionRuns.status,
      queueVersion: laundryProduction.productionRuns.queueVersion,
    })
    .from(laundryProduction.productionRuns)
    .where(
      and(
        eq(laundryProduction.productionRuns.locationId, locationId),
        eq(laundryProduction.productionRuns.id, productionRunId),
      ),
    )
    .limit(1);
  const runRows = lock ? await runQuery.for('update') : await runQuery;
  const run = runRows[0];
  if (run === undefined) return null;

  const orderQuery = db
    .select({
      id: laundryProduction.productionOrders.id,
      operationalStatus: laundryProduction.productionOrders.operationalStatus,
      executionStatus: laundryProduction.productionOrders.executionStatus,
      resolutionState: laundryProduction.productionOrders.resolutionState,
      version: laundryProduction.productionOrders.version,
      weightLbs: laundryProduction.productionOrders.derivedWeightLbs,
    })
    .from(laundryProduction.productionOrders)
    .where(
      and(
        eq(laundryProduction.productionOrders.locationId, locationId),
        eq(laundryProduction.productionOrders.id, productionOrderId),
      ),
    )
    .limit(1);
  const orderRows = lock ? await orderQuery.for('update') : await orderQuery;
  const order = orderRows[0];
  if (order === undefined) return null;

  const membershipQuery = db
    .select({
      id: laundryProduction.productionBatchOrders.id,
      productionBatchId:
        laundryProduction.productionBatchOrders.productionBatchId,
    })
    .from(laundryProduction.productionBatchOrders)
    .where(
      and(
        eq(laundryProduction.productionBatchOrders.locationId, locationId),
        eq(
          laundryProduction.productionBatchOrders.productionOrderId,
          productionOrderId,
        ),
        eq(laundryProduction.productionBatchOrders.active, true),
      ),
    )
    .limit(1);
  const membershipRows = lock
    ? await membershipQuery.for('update')
    : await membershipQuery;
  const membership = membershipRows[0];
  if (membership === undefined) return null;

  const batchesQuery = db
    .select()
    .from(laundryProduction.productionBatches)
    .where(
      and(
        eq(laundryProduction.productionBatches.locationId, locationId),
        eq(
          laundryProduction.productionBatches.productionRunId,
          productionRunId,
        ),
      ),
    )
    .orderBy(asc(laundryProduction.productionBatches.sequenceIndex));
  const batchRows = lock
    ? await batchesQuery.for('update')
    : await batchesQuery;
  const source = batchRows.find(
    (batch) => batch.id === membership.productionBatchId,
  );
  if (source === undefined) return null;
  const batchIds = batchRows.map((batch) => batch.id);

  const stageQuery = db
    .select({
      id: laundryProduction.stageRuns.id,
      productionBatchId: laundryProduction.stageRuns.productionBatchId,
      stageKind: laundryProduction.stageRuns.stageKind,
      status: laundryProduction.stageRuns.status,
    })
    .from(laundryProduction.stageRuns)
    .where(
      and(
        eq(laundryProduction.stageRuns.locationId, locationId),
        inArray(laundryProduction.stageRuns.productionBatchId, batchIds),
      ),
    )
    .orderBy(asc(laundryProduction.stageRuns.plannedStartAt));
  const stageRows = lock ? await stageQuery.for('update') : await stageQuery;
  const stageIds = stageRows.map((stage) => stage.id);

  const loadMachineCapacities = async () => {
    if (stageIds.length === 0) return [];
    const query = db
      .select({
        stageRunId: laundryProduction.stageMachineAssignments.stageRunId,
        capacityLbs: laundryProduction.machines.effectiveCapacityLbs,
      })
      .from(laundryProduction.stageMachineAssignments)
      .innerJoin(
        laundryProduction.machines,
        and(
          eq(
            laundryProduction.machines.id,
            laundryProduction.stageMachineAssignments.machineId,
          ),
          eq(
            laundryProduction.machines.locationId,
            laundryProduction.stageMachineAssignments.locationId,
          ),
        ),
      )
      .where(
        and(
          eq(laundryProduction.stageMachineAssignments.locationId, locationId),
          eq(laundryProduction.stageMachineAssignments.status, 'planned'),
          eq(laundryProduction.machines.isActive, true),
          inArray(
            laundryProduction.stageMachineAssignments.stageRunId,
            stageIds,
          ),
        ),
      )
      .orderBy(
        asc(laundryProduction.machines.id),
        asc(laundryProduction.stageMachineAssignments.id),
      );
    return lock ? await query.for('update') : await query;
  };

  const [attemptRows, assignedRows, sourceMembershipRows, machineCapacityRows] =
    await Promise.all([
      db
        .select({
          id: laundryProduction.productionOrderStageAttempts.id,
          stageRunId: laundryProduction.productionOrderStageAttempts.stageRunId,
          productionBatchId: laundryProduction.stageRuns.productionBatchId,
          stageKind: laundryProduction.productionOrderStageAttempts.stageKind,
          attemptNumber:
            laundryProduction.productionOrderStageAttempts.attemptNumber,
          status: laundryProduction.productionOrderStageAttempts.status,
        })
        .from(laundryProduction.productionOrderStageAttempts)
        .innerJoin(
          laundryProduction.stageRuns,
          and(
            eq(
              laundryProduction.stageRuns.id,
              laundryProduction.productionOrderStageAttempts.stageRunId,
            ),
            eq(
              laundryProduction.stageRuns.locationId,
              laundryProduction.productionOrderStageAttempts.locationId,
            ),
          ),
        )
        .where(
          and(
            eq(
              laundryProduction.productionOrderStageAttempts.locationId,
              locationId,
            ),
            eq(
              laundryProduction.productionOrderStageAttempts.productionRunId,
              productionRunId,
            ),
            eq(
              laundryProduction.productionOrderStageAttempts.productionOrderId,
              productionOrderId,
            ),
          ),
        ),
      stageIds.length === 0
        ? Promise.resolve([])
        : db
            .select({
              stageRunId:
                laundryProduction.productionOrderStageAttempts.stageRunId,
              weightLbs: laundryProduction.productionOrders.derivedWeightLbs,
            })
            .from(laundryProduction.productionOrderStageAttempts)
            .innerJoin(
              laundryProduction.productionOrders,
              and(
                eq(
                  laundryProduction.productionOrders.id,
                  laundryProduction.productionOrderStageAttempts
                    .productionOrderId,
                ),
                eq(
                  laundryProduction.productionOrders.locationId,
                  laundryProduction.productionOrderStageAttempts.locationId,
                ),
              ),
            )
            .where(
              and(
                eq(
                  laundryProduction.productionOrderStageAttempts.locationId,
                  locationId,
                ),
                eq(
                  laundryProduction.productionOrderStageAttempts.status,
                  'assigned',
                ),
                inArray(
                  laundryProduction.productionOrderStageAttempts.stageRunId,
                  stageIds,
                ),
              ),
            ),
      db
        .select({
          productionOrderId:
            laundryProduction.productionBatchOrders.productionOrderId,
        })
        .from(laundryProduction.productionBatchOrders)
        .where(
          and(
            eq(laundryProduction.productionBatchOrders.locationId, locationId),
            eq(
              laundryProduction.productionBatchOrders.productionBatchId,
              source.id,
            ),
            eq(laundryProduction.productionBatchOrders.active, true),
          ),
        ),
      loadMachineCapacities(),
    ]);
  const weightByStage = new Map<string, number>();
  for (const assigned of assignedRows)
    weightByStage.set(
      assigned.stageRunId,
      (weightByStage.get(assigned.stageRunId) ?? 0) + assigned.weightLbs,
    );
  const machineCapacityByStage = new Map<string, number>();
  for (const assignment of machineCapacityRows) {
    if (assignment.capacityLbs === null) continue;
    machineCapacityByStage.set(
      assignment.stageRunId,
      (machineCapacityByStage.get(assignment.stageRunId) ?? 0) +
        assignment.capacityLbs,
    );
  }

  return {
    run,
    order,
    source: {
      membershipId: membership.id,
      productionBatchId: source.id,
      sequence: source.sequenceIndex,
      status: source.status,
      membershipFrozen: source.membershipFrozenAt !== null,
      version: source.version,
      derivedWeightLbs: source.derivedWeightLbs,
      activeOrderCount: sourceMembershipRows.length,
    },
    candidates: batchRows.map((batch) => ({
      productionBatchId: batch.id,
      sequence: batch.sequenceIndex,
      status: batch.status,
      membershipFrozen: batch.membershipFrozenAt !== null,
      version: batch.version,
      derivedWeightLbs: batch.derivedWeightLbs,
      pulseCapacityLbs: batch.pulseCapacityLbs,
      stages: stageRows
        .filter((stage) => stage.productionBatchId === batch.id)
        .map((stage) => {
          const stageKind = asStage(stage.stageKind);
          const stageStatus = asStageStatus(stage.status);
          const assignedMachineCapacityLbs =
            machineCapacityByStage.get(stage.id) ?? 0;
          const plannedMachineStage =
            stageStatus === 'planned' &&
            (stageKind === 'washing' || stageKind === 'drying');
          return {
            stageRunId: stage.id,
            stage: stageKind,
            status: stageStatus,
            assignedWeightLbs:
              stageStatus === 'planned'
                ? Math.max(
                    weightByStage.get(stage.id) ?? 0,
                    batch.derivedWeightLbs,
                  )
                : (weightByStage.get(stage.id) ?? 0),
            capacityLbs: plannedMachineStage
              ? Math.min(batch.pulseCapacityLbs, assignedMachineCapacityLbs)
              : batch.pulseCapacityLbs,
          };
        }),
    })),
    attempts: attemptRows.map((attempt) => ({
      id: attempt.id,
      stageRunId: attempt.stageRunId,
      productionBatchId: attempt.productionBatchId,
      stage: asStage(attempt.stageKind),
      attemptNumber: attempt.attemptNumber,
      status: asAttemptStatus(attempt.status),
    })),
  };
};

const commit = async (
  db: DatabaseExecutor,
  ids: IdSource,
  input: CommitProductionOrderRouteInput,
): Promise<CommitProductionOrderRouteResult> => {
  const target = input.context.candidates.find(
    (candidate) =>
      candidate.productionBatchId === input.proposal.targetProductionBatchId,
  );
  if (target === undefined)
    throw productionInvariantViolation(
      'production_order_route_target_missing',
      'Route target is missing.',
    );

  const releasedMembership = await db
    .update(laundryProduction.productionBatchOrders)
    .set({
      active: false,
      releasedAt: input.now,
      releasedBy: input.actorId,
      releaseReason: input.reason,
    })
    .where(
      and(
        eq(
          laundryProduction.productionBatchOrders.id,
          input.context.source.membershipId,
        ),
        eq(laundryProduction.productionBatchOrders.active, true),
      ),
    )
    .returning({ id: laundryProduction.productionBatchOrders.id });
  if (releasedMembership.length !== 1)
    throw productionConcurrencyConflict(
      'production_order_route_membership_version_conflict',
      'Source order membership changed concurrently.',
    );

  const expectedReleaseAttemptIds = input.context.attempts
    .filter(
      (attempt) =>
        attempt.productionBatchId === input.context.source.productionBatchId &&
        attempt.status === 'assigned' &&
        input.proposal.releasedStages.includes(attempt.stage),
    )
    .map((attempt) => attempt.id);
  const releaseAttemptIds = input.attemptLifecycles.map(
    (attempt) => attempt.attemptId,
  );
  if (
    expectedReleaseAttemptIds.length !== input.proposal.releasedStages.length ||
    releaseAttemptIds.length !== expectedReleaseAttemptIds.length ||
    expectedReleaseAttemptIds.some(
      (attemptId) => !releaseAttemptIds.includes(attemptId),
    ) ||
    input.attemptLifecycles.some(
      (attempt) =>
        attempt.lifecycle.from !== 'assigned' ||
        attempt.lifecycle.state !== 'released',
    )
  )
    throw productionConcurrencyConflict(
      'production_order_route_source_attempts_conflict',
      'The unfinished source route no longer matches production.',
    );
  if (releaseAttemptIds.length > 0) {
    const releasedAttempts = await db
      .update(laundryProduction.productionOrderStageAttempts)
      .set({
        status: input.attemptLifecycles[0]!.lifecycle.state,
        releasedAt: input.now,
        releasedBy: input.actorId,
        releaseReason: input.reason,
        updatedAt: input.now,
      })
      .where(
        and(
          inArray(
            laundryProduction.productionOrderStageAttempts.id,
            releaseAttemptIds,
          ),
          eq(
            laundryProduction.productionOrderStageAttempts.status,
            input.attemptLifecycles[0]!.lifecycle.from,
          ),
        ),
      )
      .returning({ id: laundryProduction.productionOrderStageAttempts.id });
    if (releasedAttempts.length !== releaseAttemptIds.length)
      throw productionConcurrencyConflict(
        'production_order_route_attempt_version_conflict',
        'Source route attempts changed concurrently.',
      );
  }

  await db.insert(laundryProduction.productionBatchOrders).values({
    id: ids.next(),
    locationId: input.locationId,
    productionBatchId: target.productionBatchId,
    productionOrderId: input.context.order.id,
    active: true,
    placementProvenance:
      input.proposal.kind === 'queued_move'
        ? 'manual_rebatch'
        : 'exception_route',
    placedAt: input.now,
    placedBy: input.actorId,
    pinnedAt: input.proposal.kind === 'queued_move' ? input.now : null,
    pinnedBy: input.proposal.kind === 'queued_move' ? input.actorId : null,
  });

  const createdAttemptIds: string[] = [];
  for (const stage of input.proposal.assignedStages) {
    const targetStage = target.stages.find(
      (candidate) => candidate.stage === stage,
    );
    if (targetStage === undefined)
      throw productionInvariantViolation(
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
    await db.insert(laundryProduction.productionOrderStageAttempts).values({
      id,
      locationId: input.locationId,
      productionRunId: input.context.run.id,
      productionOrderId: input.context.order.id,
      stageRunId: targetStage.stageRunId,
      stageKind: stage,
      attemptNumber,
      status: input.initialAttemptState,
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
    throw productionInvariantViolation(
      'production_order_route_capacity_invalid',
      'Route aggregate weights violate hard capacity.',
    );

  const [updatedSource] = await db
    .update(laundryProduction.productionBatches)
    .set({
      derivedWeightLbs: sourceWeight,
      version: input.context.source.version + 1,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(
          laundryProduction.productionBatches.id,
          input.context.source.productionBatchId,
        ),
        eq(
          laundryProduction.productionBatches.version,
          input.context.source.version,
        ),
      ),
    )
    .returning({ version: laundryProduction.productionBatches.version });
  const [updatedTarget] = await db
    .update(laundryProduction.productionBatches)
    .set({
      derivedWeightLbs: targetWeight,
      version: target.version + 1,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(laundryProduction.productionBatches.id, target.productionBatchId),
        eq(laundryProduction.productionBatches.version, target.version),
      ),
    )
    .returning({ version: laundryProduction.productionBatches.version });
  if (updatedSource === undefined || updatedTarget === undefined)
    throw productionConcurrencyConflict(
      'production_order_route_batch_version_conflict',
      'Source or target batch changed concurrently.',
    );

  const [updatedOrder] = await db
    .update(laundryProduction.productionOrders)
    .set({
      operationalStatus: input.orderExecutionState,
      executionStatus: input.orderExecutionState,
      version: input.context.order.version + 1,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(laundryProduction.productionOrders.id, input.context.order.id),
        eq(
          laundryProduction.productionOrders.version,
          input.context.order.version,
        ),
        eq(
          laundryProduction.productionOrders.executionStatus,
          input.context.order.executionStatus,
        ),
        eq(laundryProduction.productionOrders.resolutionState, 'open'),
      ),
    )
    .returning({ version: laundryProduction.productionOrders.version });
  if (updatedOrder === undefined)
    throw productionConcurrencyConflict(
      'production_order_route_order_version_conflict',
      'Production order changed concurrently.',
    );

  const [updatedRun] = await db
    .update(laundryProduction.productionRuns)
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
        eq(laundryProduction.productionRuns.id, input.context.run.id),
        eq(
          laundryProduction.productionRuns.queueVersion,
          input.context.run.queueVersion,
        ),
        eq(laundryProduction.productionRuns.status, 'started'),
      ),
    )
    .returning({ queueVersion: laundryProduction.productionRuns.queueVersion });
  if (updatedRun === undefined)
    throw productionConcurrencyConflict(
      'production_order_route_queue_version_conflict',
      'Production queue changed concurrently.',
    );

  const outcome: CommitProductionOrderRouteResult = {
    status: 'routed',
    proposal: input.proposal,
    queueVersion: updatedRun.queueVersion,
    orderVersion: updatedOrder.version,
    sourceBatchVersion: updatedSource.version,
    targetBatchVersion: updatedTarget.version,
    createdAttemptIds,
    replayed: false,
  };
  await appendWorkEvent(db, ids, {
    locationId: input.locationId,
    eventType:
      input.proposal.kind === 'queued_move'
        ? 'production_order_rebatched'
        : 'production_order_route_exception_recorded',
    entityType: 'production_order',
    entityId: input.context.order.id,
    actorId: input.actorId,
    expectedVersion: input.context.order.version,
    idempotencyKey: input.idempotencyKey,
    payload: {
      productionRunId: input.context.run.id,
      sourceProductionBatchId: input.context.source.productionBatchId,
      targetProductionBatchId: target.productionBatchId,
      reason: input.reason,
      restartStage: input.proposal.restartStage,
      releasedStages: input.proposal.releasedStages,
      assignedStages: input.proposal.assignedStages,
      proposalHash: input.proposal.proposalHash,
      queueVersion: outcome.queueVersion,
      orderVersion: outcome.orderVersion,
      ...(input.note === undefined ? {} : { note: input.note }),
    },
    idempotency: { command: input.idempotency, result: outcome },
  });
  return outcome;
};

export const makeRouteProductionOrderRepository = (deps: {
  db: Database;
  ids: IdSource;
}): RouteProductionOrderRepository =>
  defineUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    loadContext: (locationId, productionRunId, productionOrderId, lock) =>
      loadContext(db, locationId, productionRunId, productionOrderId, lock),
    commit: (input) => commit(db, deps.ids, input),
  }));
