import type { ProductionScopeReconciliationV1Capability } from '@pressly/access-system/capabilities/production-scope-reconciliation-v1';
import type { PostgresDatabase } from '@pressly/postgres/client';
import {
  and,
  asc,
  count,
  eq,
  gt,
  gte,
  inArray,
  lt,
  ne,
  or,
  sql,
} from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import type { ProductionRules } from '../../../model/public.ts';
import {
  assessOrderCommandCapabilities,
  assessResolutionAvailability,
} from './capabilities.ts';
import { orderControlCursor } from './cursor.ts';
import { productionDueFilter } from './due.ts';
import {
  attentionFor,
  projectAdmissionOverride,
  projectAssignmentReason,
  projectAttemptStatus,
  projectBatchStatus,
  projectPlacementProvenance,
  projectProductionOrder,
  projectRouteReason,
  projectSourceAdmissionState,
  projectStage,
  projectStageStatus,
  stageOrder,
} from './project.ts';
import type {
  ListOrderControlRepository,
  ProductionOrderCommandCapabilityContext,
  ProductionOrderControlItem,
  ProductionOrderRouteAttempt,
} from './types.ts';

const invariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

type NullablePlacement = Readonly<{
  productionRunId: string | null;
  productionBatchId: string | null;
  batchSequence: number | null;
  batchStatus: string | null;
  batchVersion: number | null;
  queueVersion: number | null;
  placementProvenance: string | null;
}>;

const hasCompletePlacement = <Row extends NullablePlacement>(
  row: Row,
): row is Row &
  Readonly<{
    productionRunId: string;
    productionBatchId: string;
    batchSequence: number;
    batchStatus: string;
    batchVersion: number;
    queueVersion: number;
    placementProvenance: string;
  }> =>
  row.productionRunId !== null &&
  row.productionBatchId !== null &&
  row.batchSequence !== null &&
  row.batchStatus !== null &&
  row.batchVersion !== null &&
  row.queueVersion !== null &&
  row.placementProvenance !== null;

const anySelectionEvidence = (
  input: {
    locationId: string;
    productionOrderId: ProductionSchema['productionOrders']['id'];
  },
  schema: ProductionSchema,
) => sql<boolean>`(
  exists (
    select 1
    from ${schema.productionShiftSelectedOrders} selected_order
    where selected_order.production_order_id = ${input.productionOrderId}
      and selected_order.location_id = ${input.locationId}
  )
  or exists (
    select 1
    from ${schema.scheduleRuns} schedule_history
    where schedule_history.location_id = ${input.locationId}
      and schedule_history.input_snapshot @> jsonb_build_object(
        'orders',
        jsonb_build_array(jsonb_build_object('id', ${input.productionOrderId}))
      )
  )
  or exists (
    select 1
    from ${schema.workEvents} selection_event
    where selection_event.location_id = ${input.locationId}
      and selection_event.entity_type = 'production_shift'
      and selection_event.event_type = 'production_shift_selection_replaced'
      and selection_event.payload_json @> jsonb_build_object(
        'selectedOrderIds',
        jsonb_build_array(${input.productionOrderId})
      )
  )
)`;

export type ListOrderControlPostgresDependencies = Readonly<{
  db: PostgresDatabase;
  policy: ProductionRules;
  productionScopeReconciliationV1: ProductionScopeReconciliationV1Capability;
}>;

export const makeListOrderControlPostgresRepository = (
  dependencies: ListOrderControlPostgresDependencies,
  schema: ProductionSchema,
): ListOrderControlRepository => ({
  list: async (input, asOf) => {
    const cursor =
      input.cursor === undefined
        ? undefined
        : orderControlCursor.decode(input.cursor, input);
    if (cursor === null) return { kind: 'invalid_cursor' };

    const location = await dependencies.productionScopeReconciliationV1.load({
      locationId: input.locationId,
    });
    if (location?.isActive !== true) return { kind: 'location_not_found' };

    const database = dependencies.db;

    const dueFilter =
      input.dueBucket === undefined
        ? null
        : productionDueFilter(input.dueBucket, asOf, location.timezone);
    const floorVisibleCondition = or(
      inArray(schema.productionOrders.operationalStatus, [
        'release_pending',
        'eligible',
        'scheduled',
      ]),
      and(
        eq(schema.productionOrders.operationalStatus, 'intake_pending'),
        or(
          eq(schema.orderDemands.phase, 'production_released'),
          eq(schema.productionOrders.admissionOverride, 'released'),
        ),
      ),
    );
    const attentionCondition = and(
      floorVisibleCondition,
      or(
        eq(schema.productionOrders.operationalStatus, 'intake_pending'),
        and(
          eq(schema.productionOrders.operationalStatus, 'eligible'),
          sql<boolean>`${schema.productionOrders.pendingPlacement} is not null`,
        ),
      ),
    );
    const activeCondition = eq(
      schema.productionOrders.operationalStatus,
      'scheduled',
    );
    const intakeCondition = inArray(schema.productionOrders.operationalStatus, [
      'release_pending',
      'intake_pending',
      'eligible',
    ]);
    const viewCondition =
      input.view === 'attention'
        ? attentionCondition
        : input.view === 'active'
          ? activeCondition
          : input.view === 'intake'
            ? intakeCondition
            : undefined;
    const movableCondition =
      input.movable === undefined
        ? undefined
        : input.movable
          ? and(
              eq(schema.productionBatches.status, 'queued'),
              sql<boolean>`${schema.productionBatches.membershipFrozenAt} is null`,
            )
          : or(
              sql<boolean>`${schema.productionBatchOrders.productionOrderId} is null`,
              ne(schema.productionBatches.status, 'queued'),
              sql<boolean>`${schema.productionBatches.membershipFrozenAt} is not null`,
            );
    const stageCondition =
      input.stage === undefined
        ? undefined
        : sql<boolean>`exists (
            select 1
            from ${schema.productionOrderStageAttempts} route_attempt
            where route_attempt.production_order_id = ${schema.productionOrders.id}
              and route_attempt.location_id = ${input.locationId}
              and route_attempt.status = 'assigned'
              and route_attempt.stage_kind = ${input.stage}
              and not exists (
                select 1
                from ${schema.productionOrderStageAttempts} earlier_attempt
                where earlier_attempt.production_order_id = route_attempt.production_order_id
                  and earlier_attempt.location_id = route_attempt.location_id
                  and earlier_attempt.status = 'assigned'
                  and case earlier_attempt.stage_kind
                    when 'sorting' then 0
                    when 'washing' then 1
                    when 'drying' then 2
                    when 'folding_packaging' then 3
                    else 4
                  end < case route_attempt.stage_kind
                    when 'sorting' then 0
                    when 'washing' then 1
                    when 'drying' then 2
                    when 'folding_packaging' then 3
                    else 4
                  end
              )
          )`;
    const cursorCondition =
      cursor === undefined
        ? undefined
        : or(
            gt(schema.productionOrders.dueAt, cursor.dueAt),
            and(
              eq(schema.productionOrders.dueAt, cursor.dueAt),
              gt(schema.productionOrders.id, cursor.id),
            ),
          );

    const rows = await database
      .select({
        id: schema.productionOrders.id,
        locationId: schema.productionOrders.locationId,
        externalOrderId: schema.orderDemands.displayReference,
        dueAt: schema.productionOrders.dueAt,
        priority: schema.productionOrders.priority,
        status: schema.productionOrders.operationalStatus,
        derivedWeightLbs: schema.productionOrders.derivedWeightLbs,
        bagCount: schema.productionOrders.bagCount,
        bagCountSource: schema.productionOrders.bagCountSource,
        intakeVersion: schema.productionOrders.intakeVersion,
        intakeRecordedAt: schema.productionOrders.intakeRecordedAt,
        version: schema.productionOrders.version,
        resolutionState: schema.productionOrders.resolutionState,
        executionStatus: schema.productionOrders.executionStatus,
        pendingPlacement: schema.productionOrders.pendingPlacement,
        admissionOverride: schema.productionOrders.admissionOverride,
        admissionState: schema.orderDemands.admissionState,
        productionBatchId: schema.productionBatchOrders.productionBatchId,
        placementProvenance: schema.productionBatchOrders.placementProvenance,
        pinnedAt: schema.productionBatchOrders.pinnedAt,
        pinnedBy: schema.productionBatchOrders.pinnedBy,
        batchSequence: schema.productionBatches.sequenceIndex,
        batchStatus: schema.productionBatches.status,
        batchVersion: schema.productionBatches.version,
        membershipFrozenAt: schema.productionBatches.membershipFrozenAt,
        productionRunId: schema.productionRuns.id,
        productionRunStatus: schema.productionRuns.status,
        queueVersion: schema.productionRuns.queueVersion,
        selectedForShift: sql<boolean>`exists (
          select 1
          from ${schema.productionShiftSelectedOrders} selected_order
          inner join ${schema.productionShifts} selected_shift
            on selected_shift.id = selected_order.production_shift_id
           and selected_shift.location_id = selected_order.location_id
          where selected_order.production_order_id = ${schema.productionOrders.id}
            and selected_order.location_id = ${input.locationId}
            and selected_shift.status = 'open'
        )`,
        resolutionHasShiftSelection: anySelectionEvidence(
          {
            locationId: input.locationId,
            productionOrderId: schema.productionOrders.id,
          },
          schema,
        ),
        hasBatchMembership: sql<boolean>`exists (
          select 1 from ${schema.productionBatchOrders} membership_history
          where membership_history.production_order_id = ${schema.productionOrders.id}
            and membership_history.location_id = ${input.locationId}
        )`,
        hasStageAttempt: sql<boolean>`exists (
          select 1 from ${schema.productionOrderStageAttempts} attempt_history
          where attempt_history.production_order_id = ${schema.productionOrders.id}
            and attempt_history.location_id = ${input.locationId}
        )`,
        hasRoute: sql<boolean>`exists (
          select 1 from ${schema.workEvents} route_event
          where route_event.entity_type = 'production_order'
            and route_event.entity_id = ${schema.productionOrders.id}
            and route_event.location_id = ${input.locationId}
            and route_event.event_type in (
              'production_order_rebatched',
              'production_order_route_exception_recorded'
            )
        )`,
      })
      .from(schema.productionOrders)
      .innerJoin(
        schema.orderDemands,
        and(
          eq(schema.orderDemands.id, schema.productionOrders.orderDemandId),
          eq(
            schema.orderDemands.locationId,
            schema.productionOrders.locationId,
          ),
        ),
      )
      .leftJoin(
        schema.productionBatchOrders,
        and(
          eq(
            schema.productionBatchOrders.productionOrderId,
            schema.productionOrders.id,
          ),
          eq(
            schema.productionBatchOrders.locationId,
            schema.productionOrders.locationId,
          ),
          eq(schema.productionBatchOrders.active, true),
        ),
      )
      .leftJoin(
        schema.productionBatches,
        and(
          eq(
            schema.productionBatches.id,
            schema.productionBatchOrders.productionBatchId,
          ),
          eq(
            schema.productionBatches.locationId,
            schema.productionBatchOrders.locationId,
          ),
        ),
      )
      .leftJoin(
        schema.productionRuns,
        and(
          eq(
            schema.productionRuns.id,
            schema.productionBatches.productionRunId,
          ),
          eq(
            schema.productionRuns.locationId,
            schema.productionBatches.locationId,
          ),
        ),
      )
      .where(
        and(
          eq(schema.productionOrders.locationId, input.locationId),
          eq(schema.productionOrders.resolutionState, 'open'),
          floorVisibleCondition,
          viewCondition,
          input.status === undefined
            ? undefined
            : eq(schema.productionOrders.operationalStatus, input.status),
          dueFilter?.dueAtOrAfter === null ||
            dueFilter?.dueAtOrAfter === undefined
            ? undefined
            : gte(schema.productionOrders.dueAt, dueFilter.dueAtOrAfter),
          dueFilter?.dueBefore === null || dueFilter?.dueBefore === undefined
            ? undefined
            : lt(schema.productionOrders.dueAt, dueFilter.dueBefore),
          input.dueBucket === undefined
            ? undefined
            : ne(schema.productionOrders.operationalStatus, 'finished'),
          input.productionRunId === undefined
            ? undefined
            : eq(schema.productionRuns.id, input.productionRunId),
          input.productionBatchId === undefined
            ? undefined
            : eq(schema.productionBatches.id, input.productionBatchId),
          input.priority === undefined
            ? undefined
            : eq(schema.productionOrders.priority, input.priority),
          input.search === undefined
            ? undefined
            : sql<boolean>`strpos(lower(${schema.orderDemands.displayReference}), lower(${input.search})) > 0`,
          movableCondition,
          stageCondition,
          cursorCondition,
        ),
      )
      .orderBy(
        asc(schema.productionOrders.dueAt),
        asc(schema.productionOrders.id),
      )
      .limit(input.limit + 1);

    const hasNextPage = rows.length > input.limit;
    const pageRows = rows.slice(0, input.limit);
    const orderIds = pageRows.map((row) => row.id);
    const attemptRows =
      orderIds.length === 0
        ? []
        : await database
            .select({
              id: schema.productionOrderStageAttempts.id,
              productionRunId:
                schema.productionOrderStageAttempts.productionRunId,
              productionOrderId:
                schema.productionOrderStageAttempts.productionOrderId,
              stageRunId: schema.productionOrderStageAttempts.stageRunId,
              productionBatchId: schema.stageRuns.productionBatchId,
              batchSequence: schema.productionBatches.sequenceIndex,
              batchStatus: schema.productionBatches.status,
              stageKind: schema.productionOrderStageAttempts.stageKind,
              stageStatus: schema.stageRuns.status,
              attemptNumber: schema.productionOrderStageAttempts.attemptNumber,
              status: schema.productionOrderStageAttempts.status,
              assignmentReason:
                schema.productionOrderStageAttempts.assignmentReason,
              assignedAt: schema.productionOrderStageAttempts.assignedAt,
              assignedBy: schema.productionOrderStageAttempts.assignedBy,
              completedAt: schema.productionOrderStageAttempts.completedAt,
              completedBy: schema.productionOrderStageAttempts.completedBy,
              releasedAt: schema.productionOrderStageAttempts.releasedAt,
              releasedBy: schema.productionOrderStageAttempts.releasedBy,
              releaseReason: schema.productionOrderStageAttempts.releaseReason,
            })
            .from(schema.productionOrderStageAttempts)
            .innerJoin(
              schema.stageRuns,
              and(
                eq(
                  schema.stageRuns.id,
                  schema.productionOrderStageAttempts.stageRunId,
                ),
                eq(
                  schema.stageRuns.locationId,
                  schema.productionOrderStageAttempts.locationId,
                ),
              ),
            )
            .innerJoin(
              schema.productionBatches,
              and(
                eq(
                  schema.productionBatches.id,
                  schema.stageRuns.productionBatchId,
                ),
                eq(
                  schema.productionBatches.locationId,
                  schema.stageRuns.locationId,
                ),
              ),
            )
            .where(
              and(
                eq(
                  schema.productionOrderStageAttempts.locationId,
                  input.locationId,
                ),
                inArray(
                  schema.productionOrderStageAttempts.productionOrderId,
                  orderIds,
                ),
              ),
            )
            .orderBy(
              asc(schema.productionOrderStageAttempts.assignedAt),
              asc(schema.productionOrderStageAttempts.attemptNumber),
            );

    const productionRunIds = [
      ...new Set(
        pageRows.flatMap((row) =>
          row.productionRunId === null ? [] : [row.productionRunId],
        ),
      ),
    ];
    const routingBatchRows =
      productionRunIds.length === 0
        ? []
        : await database
            .select({
              id: schema.productionBatches.id,
              productionRunId: schema.productionBatches.productionRunId,
              sequence: schema.productionBatches.sequenceIndex,
              status: schema.productionBatches.status,
              membershipFrozenAt: schema.productionBatches.membershipFrozenAt,
              version: schema.productionBatches.version,
              derivedWeightLbs: schema.productionBatches.derivedWeightLbs,
              pulseCapacityLbs: schema.productionBatches.pulseCapacityLbs,
            })
            .from(schema.productionBatches)
            .where(
              and(
                eq(schema.productionBatches.locationId, input.locationId),
                inArray(
                  schema.productionBatches.productionRunId,
                  productionRunIds,
                ),
              ),
            )
            .orderBy(asc(schema.productionBatches.sequenceIndex));
    const routingBatchIds = routingBatchRows.map((batch) => batch.id);
    const [routingStageRows, activeMembershipRows] =
      routingBatchIds.length === 0
        ? [[], []]
        : await Promise.all([
            database
              .select({
                id: schema.stageRuns.id,
                productionBatchId: schema.stageRuns.productionBatchId,
                stageKind: schema.stageRuns.stageKind,
                status: schema.stageRuns.status,
              })
              .from(schema.stageRuns)
              .where(
                and(
                  eq(schema.stageRuns.locationId, input.locationId),
                  inArray(schema.stageRuns.productionBatchId, routingBatchIds),
                ),
              ),
            database
              .select({
                productionBatchId:
                  schema.productionBatchOrders.productionBatchId,
              })
              .from(schema.productionBatchOrders)
              .where(
                and(
                  eq(schema.productionBatchOrders.locationId, input.locationId),
                  inArray(
                    schema.productionBatchOrders.productionBatchId,
                    routingBatchIds,
                  ),
                  eq(schema.productionBatchOrders.active, true),
                ),
              ),
          ]);
    const routingStageIds = routingStageRows.map((stage) => stage.id);
    const [assignedWeightRows, machineCapacityRows] =
      routingStageIds.length === 0
        ? [[], []]
        : await Promise.all([
            database
              .select({
                stageRunId: schema.productionOrderStageAttempts.stageRunId,
                weightLbs: schema.productionOrders.derivedWeightLbs,
              })
              .from(schema.productionOrderStageAttempts)
              .innerJoin(
                schema.productionOrders,
                and(
                  eq(
                    schema.productionOrders.id,
                    schema.productionOrderStageAttempts.productionOrderId,
                  ),
                  eq(
                    schema.productionOrders.locationId,
                    schema.productionOrderStageAttempts.locationId,
                  ),
                ),
              )
              .where(
                and(
                  eq(
                    schema.productionOrderStageAttempts.locationId,
                    input.locationId,
                  ),
                  eq(schema.productionOrderStageAttempts.status, 'assigned'),
                  inArray(
                    schema.productionOrderStageAttempts.stageRunId,
                    routingStageIds,
                  ),
                ),
              ),
            database
              .select({
                stageRunId: schema.stageMachineAssignments.stageRunId,
                capacityLbs: schema.machines.effectiveCapacityLbs,
              })
              .from(schema.stageMachineAssignments)
              .innerJoin(
                schema.machines,
                and(
                  eq(
                    schema.machines.id,
                    schema.stageMachineAssignments.machineId,
                  ),
                  eq(
                    schema.machines.locationId,
                    schema.stageMachineAssignments.locationId,
                  ),
                ),
              )
              .where(
                and(
                  eq(
                    schema.stageMachineAssignments.locationId,
                    input.locationId,
                  ),
                  eq(schema.stageMachineAssignments.status, 'planned'),
                  eq(schema.machines.isActive, true),
                  inArray(
                    schema.stageMachineAssignments.stageRunId,
                    routingStageIds,
                  ),
                ),
              ),
          ]);

    const activeOrderCountByBatch = new Map<string, number>();
    for (const membership of activeMembershipRows)
      activeOrderCountByBatch.set(
        membership.productionBatchId,
        (activeOrderCountByBatch.get(membership.productionBatchId) ?? 0) + 1,
      );
    const assignedWeightByStage = new Map<string, number>();
    for (const assignment of assignedWeightRows)
      assignedWeightByStage.set(
        assignment.stageRunId,
        (assignedWeightByStage.get(assignment.stageRunId) ?? 0) +
          assignment.weightLbs,
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
    const routingBatchById = new Map(
      routingBatchRows.map((batch) => [batch.id, batch]),
    );
    const routingStagesByBatch = new Map<
      string,
      ProductionOrderCommandCapabilityContext['candidates'][number]['stages']
    >();
    for (const stage of routingStageRows) {
      const batch = routingBatchById.get(stage.productionBatchId);
      if (batch === undefined)
        throw invariant(
          'production_order_control_routing_batch_missing',
          'Routing stage is missing its production batch.',
        );
      const stages = routingStagesByBatch.get(stage.productionBatchId) ?? [];
      const stageKind = projectStage(stage.stageKind);
      const stageStatus = projectStageStatus(stage.status);
      const assignedMachineCapacityLbs =
        machineCapacityByStage.get(stage.id) ?? 0;
      const plannedMachineStage =
        stageStatus === 'planned' &&
        (stageKind === 'washing' || stageKind === 'drying');
      routingStagesByBatch.set(stage.productionBatchId, [
        ...stages,
        {
          stage: stageKind,
          status: stageStatus,
          assignedWeightLbs:
            stageStatus === 'planned'
              ? Math.max(
                  assignedWeightByStage.get(stage.id) ?? 0,
                  batch.derivedWeightLbs,
                )
              : (assignedWeightByStage.get(stage.id) ?? 0),
          capacityLbs: plannedMachineStage
            ? Math.min(batch.pulseCapacityLbs, assignedMachineCapacityLbs)
            : batch.pulseCapacityLbs,
        },
      ]);
    }
    const routingCandidatesByRun = new Map<
      string,
      ProductionOrderCommandCapabilityContext['candidates']
    >();
    for (const batch of routingBatchRows) {
      const candidates =
        routingCandidatesByRun.get(batch.productionRunId) ?? [];
      routingCandidatesByRun.set(batch.productionRunId, [
        ...candidates,
        {
          productionBatchId: batch.id,
          sequence: batch.sequence,
          status: projectBatchStatus(batch.status),
          membershipFrozen: batch.membershipFrozenAt !== null,
          version: batch.version,
          derivedWeightLbs: batch.derivedWeightLbs,
          pulseCapacityLbs: batch.pulseCapacityLbs,
          stages: routingStagesByBatch.get(batch.id) ?? [],
        },
      ]);
    }

    const attemptsByOrder = new Map<string, ProductionOrderRouteAttempt[]>();
    for (const row of attemptRows) {
      const attempt: ProductionOrderRouteAttempt = {
        id: row.id,
        productionRunId: row.productionRunId,
        stageRunId: row.stageRunId,
        productionBatchId: row.productionBatchId,
        batchSequence: row.batchSequence,
        batchStatus: projectBatchStatus(row.batchStatus),
        stage: projectStage(row.stageKind),
        stageStatus: projectStageStatus(row.stageStatus),
        attemptNumber: row.attemptNumber,
        status: projectAttemptStatus(row.status),
        assignmentReason: projectAssignmentReason(row.assignmentReason),
        assignedAt: row.assignedAt,
        assignedBy: row.assignedBy,
        completedAt: row.completedAt,
        completedBy: row.completedBy,
        releasedAt: row.releasedAt,
        releasedBy: row.releasedBy,
        releaseReason: projectRouteReason(row.releaseReason),
      };
      const attempts = attemptsByOrder.get(row.productionOrderId) ?? [];
      attempts.push(attempt);
      attemptsByOrder.set(row.productionOrderId, attempts);
    }

    const [attentionCount, activeCount, allCount] = await Promise.all([
      database
        .select({ value: count() })
        .from(schema.productionOrders)
        .innerJoin(
          schema.orderDemands,
          eq(schema.orderDemands.id, schema.productionOrders.orderDemandId),
        )
        .where(
          and(
            eq(schema.productionOrders.locationId, input.locationId),
            eq(schema.productionOrders.resolutionState, 'open'),
            attentionCondition,
          ),
        ),
      database
        .select({ value: count() })
        .from(schema.productionOrders)
        .innerJoin(
          schema.orderDemands,
          eq(schema.orderDemands.id, schema.productionOrders.orderDemandId),
        )
        .where(
          and(
            eq(schema.productionOrders.locationId, input.locationId),
            eq(schema.productionOrders.resolutionState, 'open'),
            activeCondition,
          ),
        ),
      database
        .select({ value: count() })
        .from(schema.productionOrders)
        .innerJoin(
          schema.orderDemands,
          eq(schema.orderDemands.id, schema.productionOrders.orderDemandId),
        )
        .where(
          and(
            eq(schema.productionOrders.locationId, input.locationId),
            eq(schema.productionOrders.resolutionState, 'open'),
            floorVisibleCondition,
          ),
        ),
    ]);

    const items: ProductionOrderControlItem[] = pageRows.map((row) => {
      const order = projectProductionOrder(row, asOf, location.timezone);
      const attempts = attemptsByOrder.get(row.id) ?? [];
      const assigned = attempts
        .filter((attempt) => attempt.status === 'assigned')
        .sort(
          (left, right) =>
            left.batchSequence - right.batchSequence ||
            stageOrder(left.stage) - stageOrder(right.stage),
        );
      const currentPlacement = hasCompletePlacement(row)
        ? {
            productionRunId: row.productionRunId,
            productionBatchId: row.productionBatchId,
            batchSequence: row.batchSequence,
            batchStatus: projectBatchStatus(row.batchStatus),
            batchVersion: row.batchVersion,
            queueVersion: row.queueVersion,
            membershipFrozen: row.membershipFrozenAt !== null,
            placementProvenance: projectPlacementProvenance(
              row.placementProvenance,
            ),
            pinnedAt: row.pinnedAt,
            pinnedBy: row.pinnedBy,
          }
        : null;
      const routingCandidates =
        row.productionRunId === null
          ? []
          : (routingCandidatesByRun.get(row.productionRunId) ?? []);
      const routingSource =
        row.productionBatchId === null
          ? null
          : (routingCandidates.find(
              (candidate) =>
                candidate.productionBatchId === row.productionBatchId,
            ) ?? null);
      const commands = assessOrderCommandCapabilities(dependencies.policy, {
        order: {
          id: row.id,
          operationalStatus: row.status,
          executionStatus: row.executionStatus,
          resolutionState: row.resolutionState,
          version: row.version,
          weightLbs: row.derivedWeightLbs,
        },
        run:
          row.productionRunId === null ||
          row.productionRunStatus === null ||
          row.queueVersion === null
            ? null
            : {
                id: row.productionRunId,
                status: row.productionRunStatus,
                queueVersion: row.queueVersion,
              },
        source:
          routingSource === null
            ? null
            : {
                ...routingSource,
                activeOrderCount:
                  activeOrderCountByBatch.get(
                    routingSource.productionBatchId,
                  ) ?? 0,
              },
        sourceAttempts:
          routingSource === null
            ? []
            : attempts
                .filter(
                  (attempt) =>
                    attempt.productionBatchId ===
                    routingSource.productionBatchId,
                )
                .map((attempt) => ({
                  stage: attempt.stage,
                  status: attempt.status,
                })),
        candidates: routingCandidates,
      });
      const sourceState = projectSourceAdmissionState(row.admissionState);
      const admissionOverride = projectAdmissionOverride(row.admissionOverride);
      const effectiveState =
        sourceState === 'withdrawn'
          ? 'withdrawn'
          : admissionOverride === 'released'
            ? 'released'
            : sourceState;
      return {
        order,
        admission: {
          sourceState,
          override: admissionOverride,
          effectiveState,
          allowedActions: [
            ...dependencies.policy.allowedProductionAdmissionActions({
              sourceAdmissionState: sourceState,
              productionStatus: order.status,
              admissionOverride,
              bagCount: order.bagCount,
              selectedForShift: row.selectedForShift,
              hasActivePlacement: currentPlacement !== null,
            }),
          ],
        },
        attention: attentionFor(order, row.pendingPlacement),
        currentPlacement,
        nextRequiredStage: assigned[0]?.stage ?? null,
        routeAttempts: attempts,
        commands,
        resolutionAction: assessResolutionAvailability(dependencies.policy, {
          resolutionState: row.resolutionState,
          executionStatus: row.executionStatus,
          operationalStatus: row.status,
          expectedVersion: row.version,
          hasShiftSelection: row.resolutionHasShiftSelection,
          hasBatchMembership: row.hasBatchMembership,
          hasStageAttempt: row.hasStageAttempt,
          hasRoute: row.hasRoute,
          hasIntake:
            row.intakeVersion > 0 ||
            row.intakeRecordedAt !== null ||
            row.bagCount !== null,
          hasManualAdmission: row.admissionOverride !== null,
          isPriority: row.priority,
          hasPendingPlacement: row.pendingPlacement !== null,
        }),
      };
    });
    const last = pageRows.at(-1);
    return {
      kind: 'found',
      result: {
        items,
        counts: {
          attention: attentionCount[0]?.value ?? 0,
          active: activeCount[0]?.value ?? 0,
          all: allCount[0]?.value ?? 0,
        },
        nextCursor:
          hasNextPage && last !== undefined
            ? orderControlCursor.encode(input, {
                dueAt: last.dueAt,
                id: last.id,
              })
            : null,
        asOf,
      },
    };
  },
});
