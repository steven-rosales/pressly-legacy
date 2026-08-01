import {
  and,
  asc,
  desc,
  eq,
  inArray,
  laundryProduction,
  sql,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import type {
  ProductionPendingPlacement,
  ProductionPlacementPreview,
} from '@pressly/contracts';
import type { OnlinePlacementProposal } from '../scheduling/online-placement.port.ts';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import {
  loadProductionPlacementOrder,
  loadProductionPlacementRun,
  loadProductionRunPlacementContext,
  makeProductionOrderPlacementContext,
} from '../persistence/production-order-placement-context.ts';
import { lockLocationScheduling } from '../persistence/scheduling-locks.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';
import type { ProductionOrderSchedulingMutation } from '../production-lifecycle/production-lifecycle.port.ts';
import type {
  PlaceProductionOrderRepository,
  PlacementContext,
  PlacementOutcomeInput,
  StoredOvertimeProposal,
} from './place-production-order.port.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const asStoredOvertimeProposal = (
  payload: unknown,
): StoredOvertimeProposal | null => {
  if (!isRecord(payload)) return null;
  const mode = payload['mode'];
  const targetBatchId = payload['targetBatchId'];
  const proposalHash = payload['proposalHash'];
  const queueVersion = payload['queueVersion'];
  if (
    (mode !== 'automatic' && mode !== 'manager_exact') ||
    (targetBatchId !== null && typeof targetBatchId !== 'string') ||
    typeof proposalHash !== 'string' ||
    typeof queueVersion !== 'number'
  )
    return null;
  return { mode, targetBatchId, proposalHash, queueVersion };
};

const placementPreview = (
  proposal: OnlinePlacementProposal,
): ProductionPlacementPreview => ({
  target:
    proposal.target.type === 'existing_batch'
      ? {
          kind: 'existing_batch',
          productionBatchId: proposal.target.batchId,
          sequence: proposal.target.sequence,
        }
      : {
          kind: 'new_batch',
          sequence: proposal.target.insertAtSequence,
        },
  affectedBatchIds: proposal.affectedBatches.flatMap((batch) =>
    batch.sourceBatchId === null ? [] : [batch.sourceBatchId],
  ),
  queueVersion: proposal.expectedQueueVersion,
  proposalHash: proposal.placementPlanHash,
  projectedCompletionAt: proposal.projectedCompletionAt,
  overtimeMinutes: proposal.overtime.overrunMinutes,
});

const pendingPlacementForOutcome = (
  input: PlacementOutcomeInput,
): ProductionPendingPlacement | null => {
  if (input.result.status === 'placed') return null;
  if (input.result.status === 'confirmation_required')
    return {
      status: 'confirmation_required',
      mode: input.result.mode,
      productionRunId: input.result.productionRunId,
      target: input.result.target,
      affectedBatchIds: input.result.affectedBatchIds,
      queueVersion: input.result.queueVersion,
      proposalHash: input.result.proposalHash,
      projectedCompletionAt: input.result.projectedCompletionAt,
      overtimeMinutes: input.result.overtimeMinutes,
    };

  return {
    status: 'not_placed',
    mode: input.result.mode,
    productionRunId: input.result.productionRunId,
    reason: input.result.reason,
    message: input.result.message,
    queueVersion: input.result.queueVersion,
    preview: input.proposal === null ? null : placementPreview(input.proposal),
  };
};

const recordOutcome = async (
  db: DatabaseExecutor,
  ids: Readonly<{ next: () => string }>,
  input: PlacementOutcomeInput,
): Promise<void> => {
  const pendingPlacement = pendingPlacementForOutcome(input);
  if (pendingPlacement !== null)
    await db
      .update(laundryProduction.productionOrders)
      .set({ pendingPlacement, updatedAt: input.now })
      .where(
        and(
          eq(laundryProduction.productionOrders.locationId, input.locationId),
          eq(laundryProduction.productionOrders.id, input.productionOrderId),
          eq(laundryProduction.productionOrders.operationalStatus, 'eligible'),
          eq(laundryProduction.productionOrders.resolutionState, 'open'),
        ),
      );

  await appendWorkEvent(db, ids, {
    locationId: input.locationId,
    eventType:
      input.result.status === 'confirmation_required'
        ? 'production_order_placement_overtime_required'
        : 'production_order_placement_resolved',
    entityType: 'production_order',
    entityId: input.productionOrderId,
    actorId: input.actorId,
    ...(input.proposal === null
      ? {}
      : { expectedVersion: input.proposal.expectedQueueVersion }),
    idempotencyKey: input.idempotencyKey,
    payload: {
      productionRunId: input.productionRunId,
      authorizedAction: input.authorizedAction,
      mode: input.mode,
      targetBatchId: input.targetBatchId,
      proposalHash: input.proposal?.placementPlanHash ?? null,
      queueVersion:
        input.proposal?.expectedQueueVersion ?? input.result.queueVersion,
      outcome: input.result.status,
    },
    idempotency: { command: input.idempotency, result: input.result },
  });
};

const commitPlacement = async (
  db: DatabaseExecutor,
  ids: Readonly<{ next: () => string }>,
  input: PlacementOutcomeInput & {
    context: PlacementContext;
    proposal: OnlinePlacementProposal;
    overtimeConfirmed: boolean;
    orderLifecycle: ProductionOrderSchedulingMutation;
    initialBatchState: 'queued';
    initialStageState: 'planned';
    initialAttemptState: 'assigned';
  },
) => {
  if (
    input.orderLifecycle.productionOrderId !== input.productionOrderId ||
    input.orderLifecycle.lifecycle.from !== 'unassigned' ||
    input.orderLifecycle.lifecycle.state !== 'scheduled'
  )
    throw new Error('Production-order execution decision is invalid.');
  const changed = input.proposal.affectedBatches.filter(
    (batch) => batch.changed,
  );
  const existingChangedIds = changed.flatMap((batch) =>
    batch.sourceBatchId === null ? [] : [batch.sourceBatchId],
  );
  if (existingChangedIds.length > 0)
    await db
      .update(laundryProduction.productionBatches)
      .set({
        sequenceIndex: sql`-${laundryProduction.productionBatches.sequenceIndex} - 1`,
      })
      .where(
        and(
          eq(laundryProduction.productionBatches.locationId, input.locationId),
          inArray(laundryProduction.productionBatches.id, existingChangedIds),
        ),
      );

  const existingStageRows =
    existingChangedIds.length === 0
      ? []
      : await db
          .select({
            id: laundryProduction.stageRuns.id,
            productionBatchId: laundryProduction.stageRuns.productionBatchId,
            stageKind: laundryProduction.stageRuns.stageKind,
          })
          .from(laundryProduction.stageRuns)
          .where(
            and(
              eq(laundryProduction.stageRuns.locationId, input.locationId),
              inArray(
                laundryProduction.stageRuns.productionBatchId,
                existingChangedIds,
              ),
              eq(laundryProduction.stageRuns.status, 'planned'),
            ),
          );

  const stationRows = await db
    .select()
    .from(laundryProduction.stations)
    .where(eq(laundryProduction.stations.locationId, input.locationId));
  const stationByKind = new Map(
    stationRows.map((station) => [station.kind, station.id]),
  );
  const batchIdByProjection = new Map<string, string>();
  const stageRunIdByBatchAndKind = new Map<string, string>(
    existingStageRows.map((stage) => [
      `${stage.productionBatchId}:${stage.stageKind}`,
      stage.id,
    ]),
  );
  let createdBatchId: string | null = null;

  for (const projection of input.proposal.affectedBatches) {
    if (projection.sourceBatchId !== null)
      batchIdByProjection.set(
        projection.sourceBatchId,
        projection.sourceBatchId,
      );
    if (!projection.changed) continue;

    const batchId = projection.sourceBatchId ?? ids.next();
    if (projection.sourceBatchId === null) createdBatchId = batchId;
    batchIdByProjection.set(
      projection.sourceBatchId ?? `new:${projection.sequence}`,
      batchId,
    );
    const plannedDoneAt = new Date(
      projection.stages[projection.stages.length - 1]!.endsAt,
    );
    if (projection.sourceBatchId === null)
      await db.insert(laundryProduction.productionBatches).values({
        id: batchId,
        locationId: input.locationId,
        productionRunId: input.productionRunId,
        sequenceIndex: projection.sequence,
        status: input.initialBatchState,
        pulseCapacityLbs: input.context.input.run.pulseCapacityLbs,
        derivedWeightLbs: projection.derivedWeightLbs,
        pulseMinutes: input.context.input.run.pulseMinutes,
        plannedDoneAt,
        version: 1,
        createdAt: input.now,
        updatedAt: input.now,
      });
    else
      await db
        .update(laundryProduction.productionBatches)
        .set({
          sequenceIndex: projection.sequence,
          derivedWeightLbs: projection.derivedWeightLbs,
          plannedDoneAt,
          version: sql`${laundryProduction.productionBatches.version} + 1`,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(
              laundryProduction.productionBatches.locationId,
              input.locationId,
            ),
            eq(laundryProduction.productionBatches.id, batchId),
            eq(laundryProduction.productionBatches.status, 'queued'),
            sql`${laundryProduction.productionBatches.membershipFrozenAt} is null`,
          ),
        );

    for (const stage of projection.stages) {
      const stationId = stationByKind.get(stage.stage);
      if (stationId === undefined)
        throw new Error(`Production station missing: ${stage.stage}.`);
      const stageKey = `${batchId}:${stage.stage}`;
      const existingStageRunId = stageRunIdByBatchAndKind.get(stageKey);
      const stageRunId = existingStageRunId ?? ids.next();
      if (existingStageRunId === undefined)
        await db.insert(laundryProduction.stageRuns).values({
          id: stageRunId,
          locationId: input.locationId,
          productionBatchId: batchId,
          stationId,
          stageKind: stage.stage,
          status: input.initialStageState,
          plannedStartAt: new Date(stage.startsAt),
          plannedEndAt: new Date(stage.endsAt),
          version: 1,
          createdAt: input.now,
          updatedAt: input.now,
        });
      else {
        const [updatedStage] = await db
          .update(laundryProduction.stageRuns)
          .set({
            stationId,
            plannedStartAt: new Date(stage.startsAt),
            plannedEndAt: new Date(stage.endsAt),
            version: sql`${laundryProduction.stageRuns.version} + 1`,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(laundryProduction.stageRuns.id, stageRunId),
              eq(laundryProduction.stageRuns.locationId, input.locationId),
              eq(laundryProduction.stageRuns.status, 'planned'),
            ),
          )
          .returning({ id: laundryProduction.stageRuns.id });
        if (updatedStage === undefined)
          throw new Error('A queued stage changed during reprojection.');
        await db
          .delete(laundryProduction.stageMachineAssignments)
          .where(
            and(
              eq(
                laundryProduction.stageMachineAssignments.locationId,
                input.locationId,
              ),
              eq(
                laundryProduction.stageMachineAssignments.stageRunId,
                stageRunId,
              ),
              eq(laundryProduction.stageMachineAssignments.status, 'planned'),
            ),
          );
      }
      stageRunIdByBatchAndKind.set(stageKey, stageRunId);
      if (stage.machineIds.length > 0)
        await db.insert(laundryProduction.stageMachineAssignments).values(
          stage.machineIds.map((machineId) => ({
            id: ids.next(),
            locationId: input.locationId,
            stageRunId,
            machineId,
            plannedStartAt: new Date(stage.startsAt),
            plannedEndAt: new Date(stage.endsAt),
            status: 'planned',
            createdAt: input.now,
            updatedAt: input.now,
          })),
        );
    }
  }

  const targetBatchId =
    input.proposal.target.type === 'existing_batch'
      ? input.proposal.target.batchId
      : createdBatchId;
  if (targetBatchId === null)
    throw new Error('The placement target batch was not materialized.');

  await db.insert(laundryProduction.productionBatchOrders).values({
    locationId: input.locationId,
    productionBatchId: targetBatchId,
    productionOrderId: input.productionOrderId,
    active: true,
    placementProvenance:
      input.mode === 'manager_exact' ? 'manager_exact' : 'automatic',
    placedAt: input.now,
    placedBy: input.actorId,
    pinnedAt: input.mode === 'manager_exact' ? input.now : null,
    pinnedBy: input.mode === 'manager_exact' ? input.actorId : null,
  });
  const targetStageRuns = [
    'sorting',
    'washing',
    'drying',
    'folding_packaging',
  ].map((stageKind) => {
    const stageRunId = stageRunIdByBatchAndKind.get(
      `${targetBatchId}:${stageKind}`,
    );
    if (stageRunId === undefined)
      throw new Error(`Placed order target stage is missing: ${stageKind}.`);
    return { stageKind, stageRunId };
  });
  await db.insert(laundryProduction.productionOrderStageAttempts).values(
    targetStageRuns.map(({ stageKind, stageRunId }) => ({
      id: ids.next(),
      locationId: input.locationId,
      productionRunId: input.productionRunId,
      productionOrderId: input.productionOrderId,
      stageRunId,
      stageKind,
      attemptNumber: 1,
      status: input.initialAttemptState,
      assignmentReason:
        input.mode === 'manager_exact' ? 'manager_exact' : 'automatic',
      assignedAt: input.now,
      assignedBy: input.actorId,
      createdAt: input.now,
      updatedAt: input.now,
    })),
  );
  const [updatedOrder] = await db
    .update(laundryProduction.productionOrders)
    .set({
      operationalStatus: input.orderLifecycle.lifecycle.state,
      executionStatus: input.orderLifecycle.lifecycle.state,
      pendingPlacement: null,
      version: input.orderLifecycle.expectedVersion + 1,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(laundryProduction.productionOrders.locationId, input.locationId),
        eq(laundryProduction.productionOrders.id, input.productionOrderId),
        eq(laundryProduction.productionOrders.operationalStatus, 'eligible'),
        eq(laundryProduction.productionOrders.resolutionState, 'open'),
        eq(
          laundryProduction.productionOrders.executionStatus,
          input.orderLifecycle.persistedState,
        ),
        eq(
          laundryProduction.productionOrders.version,
          input.orderLifecycle.expectedVersion,
        ),
      ),
    )
    .returning({ id: laundryProduction.productionOrders.id });
  if (updatedOrder === undefined)
    throw new Error('The order stopped being eligible during placement.');

  const nextQueueVersion = input.context.input.run.queueVersion + 1;
  const acknowledgesOvertime =
    input.proposal.overtime.required && input.overtimeConfirmed;
  const [updatedRun] = await db
    .update(laundryProduction.productionRuns)
    .set({
      queueVersion: nextQueueVersion,
      plannedCompletionAt: new Date(input.proposal.projectedCompletionAt),
      overtimeProposalHash: acknowledgesOvertime
        ? input.proposal.placementPlanHash
        : null,
      overtimeQueueVersion: acknowledgesOvertime ? nextQueueVersion : null,
      overtimeAcknowledgedBy: acknowledgesOvertime ? input.actorId : null,
      overtimeAcknowledgedAt: acknowledgesOvertime ? input.now : null,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(laundryProduction.productionRuns.locationId, input.locationId),
        eq(laundryProduction.productionRuns.id, input.productionRunId),
        eq(
          laundryProduction.productionRuns.queueVersion,
          input.context.input.run.queueVersion,
        ),
        eq(laundryProduction.productionRuns.status, 'started'),
      ),
    )
    .returning({ id: laundryProduction.productionRuns.id });
  if (updatedRun === undefined)
    throw new Error('The production queue changed during placement.');

  const affectedBatchIds = input.proposal.affectedBatches.map((projection) => {
    if (projection.sourceBatchId !== null) return projection.sourceBatchId;
    const batchId = batchIdByProjection.get(`new:${projection.sequence}`);
    if (batchId === undefined) throw new Error('New batch mapping is missing.');
    return batchId;
  });
  const outcome = {
    status: 'placed' as const,
    mode: input.mode,
    productionRunId: input.productionRunId,
    productionOrderId: input.productionOrderId,
    productionBatchId: targetBatchId,
    createdBatch: input.proposal.target.type === 'new_batch',
    affectedBatchIds,
    queueVersion: nextQueueVersion,
    proposalHash: input.proposal.placementPlanHash,
    plannedCompletionAt: input.proposal.projectedCompletionAt,
    overtimeMinutes: input.proposal.overtime.overrunMinutes,
    replayed: false,
  };
  await recordOutcome(db, ids, { ...input, result: outcome });
  return outcome;
};

export const makePlaceProductionOrderRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): PlaceProductionOrderRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    lockLocationScheduling: (locationId) =>
      lockLocationScheduling(db, locationId),
    findStartedRuns: async (locationId) =>
      db
        .select({
          productionRunId: laundryProduction.productionRuns.id,
          queueVersion: laundryProduction.productionRuns.queueVersion,
        })
        .from(laundryProduction.productionRuns)
        .where(
          and(
            eq(laundryProduction.productionRuns.locationId, locationId),
            eq(laundryProduction.productionRuns.status, 'started'),
          ),
        )
        .orderBy(asc(laundryProduction.productionRuns.id)),
    recordPendingRunResolution: async (input) => {
      if ((await findWorkEvent(db, input.idempotencyKey)) !== null) return;
      await db
        .update(laundryProduction.productionOrders)
        .set({ pendingPlacement: input.placement, updatedAt: input.now })
        .where(
          and(
            eq(laundryProduction.productionOrders.locationId, input.locationId),
            eq(laundryProduction.productionOrders.id, input.productionOrderId),
            eq(
              laundryProduction.productionOrders.operationalStatus,
              'eligible',
            ),
            eq(laundryProduction.productionOrders.resolutionState, 'open'),
          ),
        );
      const command = {
        operation: 'production_order_automatic_placement_pending',
        locationId: input.locationId,
        actorId: input.actorId,
        target: {
          entityType: 'production_order',
          entityId: input.productionOrderId,
        },
        expectedVersion: null,
        payload: { placement: input.placement },
      } as const;
      await appendWorkEvent(db, deps.ids, {
        locationId: input.locationId,
        eventType: 'production_order_placement_pending',
        entityType: 'production_order',
        entityId: input.productionOrderId,
        actorId: input.actorId,
        idempotencyKey: input.idempotencyKey,
        payload: { placement: input.placement },
        idempotency: { command, result: input.placement },
      });
    },
    loadContext: async (locationId, productionRunId, productionOrderId) => {
      const run = await loadProductionPlacementRun(
        db,
        locationId,
        productionRunId,
        true,
      );
      if (run === null) return null;
      const order = await loadProductionPlacementOrder(
        db,
        locationId,
        productionOrderId,
        true,
      );
      if (order === null) return null;
      const runContext = await loadProductionRunPlacementContext(
        db,
        locationId,
        run,
        true,
      );
      if (runContext === null) return null;
      const [existingMembership] = await db
        .select({
          productionOrderId:
            laundryProduction.productionBatchOrders.productionOrderId,
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

      return makeProductionOrderPlacementContext(
        runContext,
        order,
        existingMembership !== undefined,
      );
    },
    findOvertimeProposal: async (
      locationId,
      productionOrderId,
      proposalHash,
    ) => {
      const rows = await db
        .select({ payload: laundryProduction.workEvents.payload })
        .from(laundryProduction.workEvents)
        .where(
          and(
            eq(laundryProduction.workEvents.locationId, locationId),
            eq(laundryProduction.workEvents.entityType, 'production_order'),
            eq(laundryProduction.workEvents.entityId, productionOrderId),
            eq(
              laundryProduction.workEvents.eventType,
              'production_order_placement_overtime_required',
            ),
          ),
        )
        .orderBy(desc(laundryProduction.workEvents.createdAt));
      return (
        rows
          .map((row) => asStoredOvertimeProposal(row.payload))
          .find((proposal) => proposal?.proposalHash === proposalHash) ?? null
      );
    },
    recordOutcome: (input) => recordOutcome(db, deps.ids, input),
    commitPlacement: (input) => commitPlacement(db, deps.ids, input),
  }));
