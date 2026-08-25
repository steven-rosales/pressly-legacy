import type { JsonValue } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { and, eq, inArray, sql } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../schema/production-schema.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import type { IdSource } from '@pressly/cells/id-source';
import type { ProductionOrderSchedulingMutation } from '../../model/execution.ts';
import type {
  OnlinePlacementMode,
  OnlinePlacementProposal,
  ProductionOrderPlacementContext,
} from '../../model/online-order-placement/model.ts';

export type OnlineOrderPlacementPersistenceConflictCode =
  | 'production_placement_order_version_conflict'
  | 'production_placement_queue_version_conflict'
  | 'production_placement_stage_version_conflict';

export type OnlineOrderPlacementMutationInput = Readonly<{
  command: Readonly<{
    locationId: string;
    productionRunId: string;
    productionOrderId: string;
    actorId: string;
  }>;
  context: ProductionOrderPlacementContext;
  proposal: OnlinePlacementProposal;
  mode: OnlinePlacementMode;
  orderLifecycle: ProductionOrderSchedulingMutation;
  initialBatchState: 'queued';
  initialStageState: 'planned';
  initialAttemptState: 'assigned';
  overtimeAcknowledgment: Readonly<{
    proposalHash: string;
    actorId: string;
    acknowledgedAt: Date;
  }> | null;
  now: Date;
}>;

export type OnlineOrderPlacementMutation =
  | Readonly<{
      kind: 'saved';
      placement: Readonly<{
        productionBatchId: string;
        createdBatch: boolean;
        affectedBatchIds: readonly string[];
        queueVersion: number;
        proposalHash: string;
        plannedCompletionAt: string;
        overtimeMinutes: number;
      }>;
    }>
  | Readonly<{
      kind: 'conflict';
      code: OnlineOrderPlacementPersistenceConflictCode;
      message: string;
    }>;

const invariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const conflict = (
  code: OnlineOrderPlacementPersistenceConflictCode,
  message: string,
): OnlineOrderPlacementMutation => ({ kind: 'conflict', code, message });

export const persistOnlineOrderPlacementPendingOutcome = async (
  database: PostgresExecutor,
  input: Readonly<{
    locationId: string;
    productionOrderId: string;
    pendingPlacement: JsonValue;
    now: Date;
  }>,
  schema: ProductionSchema,
): Promise<void> => {
  await database
    .update(schema.productionOrders)
    .set({ pendingPlacement: input.pendingPlacement, updatedAt: input.now })
    .where(
      and(
        eq(schema.productionOrders.locationId, input.locationId),
        eq(schema.productionOrders.id, input.productionOrderId),
        eq(schema.productionOrders.operationalStatus, 'eligible'),
        eq(schema.productionOrders.resolutionState, 'open'),
      ),
    );
};

export const persistOnlineOrderPlacement = async (
  database: PostgresExecutor,
  ids: IdSource,
  input: OnlineOrderPlacementMutationInput,
  schema: ProductionSchema,
): Promise<OnlineOrderPlacementMutation> => {
  if (
    input.orderLifecycle.productionOrderId !==
      input.command.productionOrderId ||
    input.orderLifecycle.lifecycle.from !== 'unassigned' ||
    input.orderLifecycle.lifecycle.state !== 'scheduled'
  )
    throw invariant(
      'production_placement_execution_decision_invalid',
      'Production-order execution decision is invalid.',
    );

  const changed = input.proposal.affectedBatches.filter(
    (batch) => batch.changed,
  );
  const existingChangedIds = changed.flatMap((batch) =>
    batch.sourceBatchId === null ? [] : [batch.sourceBatchId],
  );
  if (existingChangedIds.length > 0)
    await database
      .update(schema.productionBatches)
      .set({
        sequenceIndex: sql`-${schema.productionBatches.sequenceIndex} - 1`,
      })
      .where(
        and(
          eq(schema.productionBatches.locationId, input.command.locationId),
          inArray(schema.productionBatches.id, existingChangedIds),
        ),
      );

  const existingStages =
    existingChangedIds.length === 0
      ? []
      : await database
          .select({
            id: schema.stageRuns.id,
            productionBatchId: schema.stageRuns.productionBatchId,
            stageKind: schema.stageRuns.stageKind,
          })
          .from(schema.stageRuns)
          .where(
            and(
              eq(schema.stageRuns.locationId, input.command.locationId),
              inArray(schema.stageRuns.productionBatchId, existingChangedIds),
              eq(schema.stageRuns.status, 'planned'),
            ),
          );
  const stations = await database
    .select()
    .from(schema.stations)
    .where(eq(schema.stations.locationId, input.command.locationId));
  const stationByKind = new Map(
    stations.map((station) => [station.kind, station.id]),
  );
  const batchIdByProjection = new Map<string, string>();
  const stageIdByBatchAndKind = new Map<string, string>(
    existingStages.map((stage) => [
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
    const finalStage = projection.stages.at(-1);
    if (finalStage === undefined)
      throw invariantViolationError({
        code: 'production_placement_batch_stages_missing',
        message: 'An online placement batch projection has no stages.',
        safeMessage: 'The Production placement projection is inconsistent.',
      });
    const plannedDoneAt = new Date(finalStage.endsAt);
    if (projection.sourceBatchId === null)
      await database.insert(schema.productionBatches).values({
        id: batchId,
        locationId: input.command.locationId,
        productionRunId: input.command.productionRunId,
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
      await database
        .update(schema.productionBatches)
        .set({
          sequenceIndex: projection.sequence,
          derivedWeightLbs: projection.derivedWeightLbs,
          plannedDoneAt,
          version: sql`${schema.productionBatches.version} + 1`,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.productionBatches.locationId, input.command.locationId),
            eq(schema.productionBatches.id, batchId),
            eq(schema.productionBatches.status, 'queued'),
            sql`${schema.productionBatches.membershipFrozenAt} is null`,
          ),
        );

    for (const stage of projection.stages) {
      const stationId = stationByKind.get(stage.stage);
      if (stationId === undefined)
        throw invariant(
          'production_placement_station_missing',
          `Production station missing: ${stage.stage}.`,
        );
      const stageKey = `${batchId}:${stage.stage}`;
      const existingStageId = stageIdByBatchAndKind.get(stageKey);
      const stageId = existingStageId ?? ids.next();
      if (existingStageId === undefined)
        await database.insert(schema.stageRuns).values({
          id: stageId,
          locationId: input.command.locationId,
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
        const [updatedStage] = await database
          .update(schema.stageRuns)
          .set({
            stationId,
            plannedStartAt: new Date(stage.startsAt),
            plannedEndAt: new Date(stage.endsAt),
            version: sql`${schema.stageRuns.version} + 1`,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(schema.stageRuns.id, stageId),
              eq(schema.stageRuns.locationId, input.command.locationId),
              eq(schema.stageRuns.status, 'planned'),
            ),
          )
          .returning({ id: schema.stageRuns.id });
        if (updatedStage === undefined)
          return conflict(
            'production_placement_stage_version_conflict',
            'A queued stage changed during reprojection.',
          );
        await database
          .delete(schema.stageMachineAssignments)
          .where(
            and(
              eq(
                schema.stageMachineAssignments.locationId,
                input.command.locationId,
              ),
              eq(schema.stageMachineAssignments.stageRunId, stageId),
              eq(schema.stageMachineAssignments.status, 'planned'),
            ),
          );
      }
      stageIdByBatchAndKind.set(stageKey, stageId);
      if (stage.machineIds.length > 0)
        await database.insert(schema.stageMachineAssignments).values(
          stage.machineIds.map((machineId) => ({
            id: ids.next(),
            locationId: input.command.locationId,
            stageRunId: stageId,
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
    throw invariant(
      'production_placement_target_not_materialized',
      'The placement target batch was not materialized.',
    );

  await database.insert(schema.productionBatchOrders).values({
    locationId: input.command.locationId,
    productionBatchId: targetBatchId,
    productionOrderId: input.command.productionOrderId,
    active: true,
    placementProvenance:
      input.mode.type === 'manager_exact' ? 'manager_exact' : 'automatic',
    placedAt: input.now,
    placedBy: input.command.actorId,
    pinnedAt: input.mode.type === 'manager_exact' ? input.now : null,
    pinnedBy:
      input.mode.type === 'manager_exact' ? input.command.actorId : null,
  });
  const targetStages = (
    ['sorting', 'washing', 'drying', 'folding_packaging'] as const
  ).map((kind) => {
    const stageId = stageIdByBatchAndKind.get(`${targetBatchId}:${kind}`);
    if (stageId === undefined)
      throw invariant(
        'production_placement_target_stage_missing',
        `Placed order target stage is missing: ${kind}.`,
      );
    return { kind, stageId };
  });
  await database.insert(schema.productionOrderStageAttempts).values(
    targetStages.map(({ kind, stageId }) => ({
      id: ids.next(),
      locationId: input.command.locationId,
      productionRunId: input.command.productionRunId,
      productionOrderId: input.command.productionOrderId,
      stageRunId: stageId,
      stageKind: kind,
      attemptNumber: 1,
      status: input.initialAttemptState,
      assignmentReason:
        input.mode.type === 'manager_exact' ? 'manager_exact' : 'automatic',
      assignedAt: input.now,
      assignedBy: input.command.actorId,
      createdAt: input.now,
      updatedAt: input.now,
    })),
  );

  const [updatedOrder] = await database
    .update(schema.productionOrders)
    .set({
      operationalStatus: input.orderLifecycle.lifecycle.state,
      executionStatus: input.orderLifecycle.lifecycle.state,
      pendingPlacement: null,
      version: input.orderLifecycle.expectedVersion + 1,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.productionOrders.locationId, input.command.locationId),
        eq(schema.productionOrders.id, input.command.productionOrderId),
        eq(schema.productionOrders.operationalStatus, 'eligible'),
        eq(schema.productionOrders.resolutionState, 'open'),
        eq(
          schema.productionOrders.executionStatus,
          input.orderLifecycle.persistedState,
        ),
        eq(
          schema.productionOrders.version,
          input.orderLifecycle.expectedVersion,
        ),
      ),
    )
    .returning({ id: schema.productionOrders.id });
  if (updatedOrder === undefined)
    return conflict(
      'production_placement_order_version_conflict',
      'The order stopped being eligible during placement.',
    );

  const nextQueueVersion = input.context.input.run.queueVersion + 1;
  const [updatedRun] = await database
    .update(schema.productionRuns)
    .set({
      queueVersion: nextQueueVersion,
      plannedCompletionAt: new Date(input.proposal.projectedCompletionAt),
      overtimeProposalHash: input.overtimeAcknowledgment?.proposalHash ?? null,
      overtimeQueueVersion:
        input.overtimeAcknowledgment === null ? null : nextQueueVersion,
      overtimeAcknowledgedBy: input.overtimeAcknowledgment?.actorId ?? null,
      overtimeAcknowledgedAt:
        input.overtimeAcknowledgment?.acknowledgedAt ?? null,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.productionRuns.locationId, input.command.locationId),
        eq(schema.productionRuns.id, input.command.productionRunId),
        eq(
          schema.productionRuns.queueVersion,
          input.context.input.run.queueVersion,
        ),
        eq(schema.productionRuns.status, 'started'),
      ),
    )
    .returning({ id: schema.productionRuns.id });
  if (updatedRun === undefined)
    return conflict(
      'production_placement_queue_version_conflict',
      'The production queue changed during placement.',
    );

  const affectedBatchIds = input.proposal.affectedBatches.map((projection) => {
    if (projection.sourceBatchId !== null) return projection.sourceBatchId;
    const batchId = batchIdByProjection.get(`new:${projection.sequence}`);
    if (batchId === undefined)
      throw invariant(
        'production_placement_new_batch_mapping_missing',
        'New batch mapping is missing.',
      );
    return batchId;
  });
  return {
    kind: 'saved',
    placement: {
      productionBatchId: targetBatchId,
      createdBatch: input.proposal.target.type === 'new_batch',
      affectedBatchIds,
      queueVersion: nextQueueVersion,
      proposalHash: input.proposal.placementPlanHash,
      plannedCompletionAt: input.proposal.projectedCompletionAt,
      overtimeMinutes: input.proposal.overtime.overrunMinutes,
    },
  };
};
