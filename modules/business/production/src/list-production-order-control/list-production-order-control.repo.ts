import {
  and,
  asc,
  count,
  eq,
  gt,
  gte,
  inArray,
  laundryProduction,
  lt,
  ne,
  or,
  sql,
  type Database,
} from '@pressly/db';
import type {
  ProductionOrderControlItem,
  ProductionOrderRouteAttempt,
} from '@pressly/contracts';
import type { ProductionPolicyPort } from '../production.port.ts';
import {
  mapProductionOrderListItem,
  productionDueFilter,
} from '../persistence/production-order-list-item.ts';
import {
  decodeProductionOrderControlCursor,
  encodeProductionOrderControlCursor,
  productionOrderControlFilterKey,
  stageOrder,
} from './list-production-order-control.mapper.ts';
import type { ListProductionOrderControlRepository } from './list-production-order-control.port.ts';

const asPlacementProvenance = (
  value: string,
): NonNullable<
  ProductionOrderControlItem['currentPlacement']
>['placementProvenance'] => {
  switch (value) {
    case 'initial_schedule':
    case 'automatic':
    case 'manager_exact':
    case 'manual_rebatch':
    case 'exception_route':
      return value;
    default:
      throw new Error(`Unknown production placement provenance: ${value}.`);
  }
};

const asBatchStatus = (
  value: string,
): NonNullable<
  ProductionOrderControlItem['currentPlacement']
>['batchStatus'] => {
  switch (value) {
    case 'queued':
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding_packaging':
    case 'finished':
      return value;
    default:
      throw new Error(`Unknown production batch status: ${value}.`);
  }
};

const asStage = (value: string): ProductionOrderRouteAttempt['stage'] => {
  switch (value) {
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding_packaging':
      return value;
    default:
      throw new Error(`Unknown production stage: ${value}.`);
  }
};

const asStageStatus = (
  value: string,
): ProductionOrderRouteAttempt['stageStatus'] => {
  switch (value) {
    case 'planned':
    case 'started':
    case 'completed':
      return value;
    default:
      throw new Error(`Unknown stage-run status: ${value}.`);
  }
};

const asAttemptStatus = (
  value: string,
): ProductionOrderRouteAttempt['status'] => {
  switch (value) {
    case 'assigned':
    case 'completed':
    case 'released':
      return value;
    default:
      throw new Error(`Unknown order-stage attempt status: ${value}.`);
  }
};

const asAssignmentReason = (
  value: string,
): ProductionOrderRouteAttempt['assignmentReason'] => {
  switch (value) {
    case 'initial_schedule':
    case 'automatic':
    case 'manager_exact':
    case 'manual_rebatch':
    case 'needs_more_drying':
    case 'rewash_required':
    case 'sorting_incomplete':
    case 'stage_incomplete':
    case 'other':
      return value;
    default:
      throw new Error(`Unknown order-stage assignment reason: ${value}.`);
  }
};

const asRouteReason = (
  value: string | null,
): ProductionOrderRouteAttempt['releaseReason'] => {
  if (value === null) return null;
  switch (value) {
    case 'manual_rebatch':
    case 'needs_more_drying':
    case 'rewash_required':
    case 'sorting_incomplete':
    case 'stage_incomplete':
    case 'other':
      return value;
    default:
      throw new Error(`Unknown order-stage release reason: ${value}.`);
  }
};

const asSourceAdmissionState = (
  value: string,
): 'unreleased' | 'released' | 'withdrawn' => {
  switch (value) {
    case 'unreleased':
    case 'released':
    case 'withdrawn':
      return value;
    default:
      throw new Error(`Unknown source admission state: ${value}.`);
  }
};

const asAdmissionOverride = (value: string | null): 'released' | null => {
  if (value === null || value === 'released') return value;
  throw new Error(`Unknown production admission override: ${value}.`);
};

const attentionFor = (
  order: ReturnType<typeof mapProductionOrderListItem>,
  pendingPlacement: unknown,
): ProductionOrderControlItem['attention'] => {
  if (order.status === 'intake_pending')
    return {
      reason: 'intake_required',
      message:
        'The source released this order to production, but physical bag intake has not been recorded.',
    };
  if (order.status !== 'eligible' || pendingPlacement === null) return null;
  const queueConflict =
    typeof pendingPlacement === 'object' &&
    !Array.isArray(pendingPlacement) &&
    Reflect.get(pendingPlacement, 'reason') === 'queue_conflict';
  return queueConflict
    ? {
        reason: 'placement_conflict',
        message: 'The production queue changed before placement completed.',
      }
    : {
        reason: 'placement_pending',
        message: 'This eligible order still needs a production position.',
      };
};

export const makeListProductionOrderControlRepository = (
  deps: Readonly<{ db: Database; policy: ProductionPolicyPort }>,
): ListProductionOrderControlRepository => ({
  list: async (command, now) => {
    const db = deps.db;
    const filterKey = productionOrderControlFilterKey(command);
    const cursor =
      command.cursor === undefined
        ? undefined
        : decodeProductionOrderControlCursor(command.cursor, filterKey);
    if (cursor === null) return { tag: 'invalid_cursor' };

    const [location] = await db
      .select({
        id: laundryProduction.productionLocations.id,
        timezone: laundryProduction.productionLocations.timezone,
      })
      .from(laundryProduction.productionLocations)
      .where(
        and(
          eq(laundryProduction.productionLocations.id, command.locationId),
          eq(laundryProduction.productionLocations.isActive, true),
        ),
      )
      .limit(1);
    if (location === undefined) return { tag: 'location_not_found' };

    const dueFilter =
      command.dueBucket === undefined
        ? null
        : productionDueFilter(command.dueBucket, now, location.timezone);

    const floorVisibleCondition = or(
      inArray(laundryProduction.productionOrders.operationalStatus, [
        'release_pending',
        'eligible',
        'scheduled',
      ]),
      and(
        eq(
          laundryProduction.productionOrders.operationalStatus,
          'intake_pending',
        ),
        or(
          eq(laundryProduction.orderDemands.phase, 'production_released'),
          eq(laundryProduction.productionOrders.admissionOverride, 'released'),
        ),
      ),
    );
    const attentionCondition = and(
      floorVisibleCondition,
      or(
        eq(
          laundryProduction.productionOrders.operationalStatus,
          'intake_pending',
        ),
        and(
          eq(laundryProduction.productionOrders.operationalStatus, 'eligible'),
          sql<boolean>`${laundryProduction.productionOrders.pendingPlacement} is not null`,
        ),
      ),
    );
    const activeCondition = eq(
      laundryProduction.productionOrders.operationalStatus,
      'scheduled',
    );
    const intakeCondition = inArray(
      laundryProduction.productionOrders.operationalStatus,
      ['release_pending', 'intake_pending', 'eligible'],
    );
    const viewCondition =
      command.view === 'attention'
        ? attentionCondition
        : command.view === 'active'
          ? activeCondition
          : command.view === 'intake'
            ? intakeCondition
            : undefined;
    const movableCondition =
      command.movable === undefined
        ? undefined
        : command.movable
          ? and(
              eq(laundryProduction.productionBatches.status, 'queued'),
              sql<boolean>`${laundryProduction.productionBatches.membershipFrozenAt} is null`,
            )
          : or(
              sql<boolean>`${laundryProduction.productionBatchOrders.productionOrderId} is null`,
              ne(laundryProduction.productionBatches.status, 'queued'),
              sql<boolean>`${laundryProduction.productionBatches.membershipFrozenAt} is not null`,
            );
    const stageCondition =
      command.stage === undefined
        ? undefined
        : sql<boolean>`exists (
            select 1
            from ${laundryProduction.productionOrderStageAttempts} route_attempt
            where route_attempt.production_order_id = ${laundryProduction.productionOrders.id}
              and route_attempt.location_id = ${command.locationId}
              and route_attempt.status = 'assigned'
              and route_attempt.stage_kind = ${command.stage}
              and not exists (
                select 1
                from ${laundryProduction.productionOrderStageAttempts} earlier_attempt
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
            gt(
              laundryProduction.productionOrders.dueAt,
              new Date(cursor.dueAt),
            ),
            and(
              eq(
                laundryProduction.productionOrders.dueAt,
                new Date(cursor.dueAt),
              ),
              gt(laundryProduction.productionOrders.id, cursor.id),
            ),
          );

    const rows = await db
      .select({
        id: laundryProduction.productionOrders.id,
        locationId: laundryProduction.productionOrders.locationId,
        externalOrderId: laundryProduction.orderDemands.displayReference,
        dueAt: laundryProduction.productionOrders.dueAt,
        priority: laundryProduction.productionOrders.priority,
        status: laundryProduction.productionOrders.operationalStatus,
        derivedWeightLbs: laundryProduction.productionOrders.derivedWeightLbs,
        bagCount: laundryProduction.productionOrders.bagCount,
        bagCountSource: laundryProduction.productionOrders.bagCountSource,
        intakeVersion: laundryProduction.productionOrders.intakeVersion,
        version: laundryProduction.productionOrders.version,
        pendingPlacement: laundryProduction.productionOrders.pendingPlacement,
        admissionOverride: laundryProduction.productionOrders.admissionOverride,
        admissionState: laundryProduction.orderDemands.admissionState,
        productionBatchId:
          laundryProduction.productionBatchOrders.productionBatchId,
        placementProvenance:
          laundryProduction.productionBatchOrders.placementProvenance,
        pinnedAt: laundryProduction.productionBatchOrders.pinnedAt,
        pinnedBy: laundryProduction.productionBatchOrders.pinnedBy,
        batchSequence: laundryProduction.productionBatches.sequenceIndex,
        batchStatus: laundryProduction.productionBatches.status,
        batchVersion: laundryProduction.productionBatches.version,
        membershipFrozenAt:
          laundryProduction.productionBatches.membershipFrozenAt,
        productionRunId: laundryProduction.productionRuns.id,
        queueVersion: laundryProduction.productionRuns.queueVersion,
        selectedForShift: sql<boolean>`exists (
          select 1
          from ${laundryProduction.productionShiftSelectedOrders} selected_order
          inner join ${laundryProduction.productionShifts} selected_shift
            on selected_shift.id = selected_order.production_shift_id
           and selected_shift.location_id = selected_order.location_id
          where selected_order.production_order_id = ${laundryProduction.productionOrders.id}
            and selected_order.location_id = ${command.locationId}
            and selected_shift.status = 'open'
        )`,
      })
      .from(laundryProduction.productionOrders)
      .innerJoin(
        laundryProduction.orderDemands,
        and(
          eq(
            laundryProduction.orderDemands.id,
            laundryProduction.productionOrders.orderDemandId,
          ),
          eq(
            laundryProduction.orderDemands.locationId,
            laundryProduction.productionOrders.locationId,
          ),
        ),
      )
      .leftJoin(
        laundryProduction.productionBatchOrders,
        and(
          eq(
            laundryProduction.productionBatchOrders.productionOrderId,
            laundryProduction.productionOrders.id,
          ),
          eq(
            laundryProduction.productionBatchOrders.locationId,
            laundryProduction.productionOrders.locationId,
          ),
          eq(laundryProduction.productionBatchOrders.active, true),
        ),
      )
      .leftJoin(
        laundryProduction.productionBatches,
        and(
          eq(
            laundryProduction.productionBatches.id,
            laundryProduction.productionBatchOrders.productionBatchId,
          ),
          eq(
            laundryProduction.productionBatches.locationId,
            laundryProduction.productionBatchOrders.locationId,
          ),
        ),
      )
      .leftJoin(
        laundryProduction.productionRuns,
        and(
          eq(
            laundryProduction.productionRuns.id,
            laundryProduction.productionBatches.productionRunId,
          ),
          eq(
            laundryProduction.productionRuns.locationId,
            laundryProduction.productionBatches.locationId,
          ),
        ),
      )
      .where(
        and(
          eq(laundryProduction.productionOrders.locationId, command.locationId),
          eq(laundryProduction.productionOrders.resolutionState, 'open'),
          floorVisibleCondition,
          viewCondition,
          command.status === undefined
            ? undefined
            : eq(
                laundryProduction.productionOrders.operationalStatus,
                command.status,
              ),
          dueFilter?.dueAtOrAfter === null ||
            dueFilter?.dueAtOrAfter === undefined
            ? undefined
            : gte(
                laundryProduction.productionOrders.dueAt,
                dueFilter.dueAtOrAfter,
              ),
          dueFilter?.dueBefore === null || dueFilter?.dueBefore === undefined
            ? undefined
            : lt(laundryProduction.productionOrders.dueAt, dueFilter.dueBefore),
          command.dueBucket === undefined
            ? undefined
            : ne(
                laundryProduction.productionOrders.operationalStatus,
                'finished',
              ),
          command.productionRunId === undefined
            ? undefined
            : eq(laundryProduction.productionRuns.id, command.productionRunId),
          command.productionBatchId === undefined
            ? undefined
            : eq(
                laundryProduction.productionBatches.id,
                command.productionBatchId,
              ),
          command.priority === undefined
            ? undefined
            : eq(laundryProduction.productionOrders.priority, command.priority),
          command.search === undefined
            ? undefined
            : sql<boolean>`strpos(lower(${laundryProduction.orderDemands.displayReference}), lower(${command.search})) > 0`,
          movableCondition,
          stageCondition,
          cursorCondition,
        ),
      )
      .orderBy(
        asc(laundryProduction.productionOrders.dueAt),
        asc(laundryProduction.productionOrders.id),
      )
      .limit(command.limit + 1);

    const hasNextPage = rows.length > command.limit;
    const pageRows = rows.slice(0, command.limit);
    const orderIds = pageRows.map((row) => row.id);
    const attemptRows =
      orderIds.length === 0
        ? []
        : await db
            .select({
              id: laundryProduction.productionOrderStageAttempts.id,
              productionRunId:
                laundryProduction.productionOrderStageAttempts.productionRunId,
              productionOrderId:
                laundryProduction.productionOrderStageAttempts
                  .productionOrderId,
              stageRunId:
                laundryProduction.productionOrderStageAttempts.stageRunId,
              productionBatchId: laundryProduction.stageRuns.productionBatchId,
              batchSequence: laundryProduction.productionBatches.sequenceIndex,
              batchStatus: laundryProduction.productionBatches.status,
              stageKind:
                laundryProduction.productionOrderStageAttempts.stageKind,
              stageStatus: laundryProduction.stageRuns.status,
              attemptNumber:
                laundryProduction.productionOrderStageAttempts.attemptNumber,
              status: laundryProduction.productionOrderStageAttempts.status,
              assignmentReason:
                laundryProduction.productionOrderStageAttempts.assignmentReason,
              assignedAt:
                laundryProduction.productionOrderStageAttempts.assignedAt,
              assignedBy:
                laundryProduction.productionOrderStageAttempts.assignedBy,
              completedAt:
                laundryProduction.productionOrderStageAttempts.completedAt,
              completedBy:
                laundryProduction.productionOrderStageAttempts.completedBy,
              releasedAt:
                laundryProduction.productionOrderStageAttempts.releasedAt,
              releasedBy:
                laundryProduction.productionOrderStageAttempts.releasedBy,
              releaseReason:
                laundryProduction.productionOrderStageAttempts.releaseReason,
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
            .innerJoin(
              laundryProduction.productionBatches,
              and(
                eq(
                  laundryProduction.productionBatches.id,
                  laundryProduction.stageRuns.productionBatchId,
                ),
                eq(
                  laundryProduction.productionBatches.locationId,
                  laundryProduction.stageRuns.locationId,
                ),
              ),
            )
            .where(
              and(
                eq(
                  laundryProduction.productionOrderStageAttempts.locationId,
                  command.locationId,
                ),
                inArray(
                  laundryProduction.productionOrderStageAttempts
                    .productionOrderId,
                  orderIds,
                ),
              ),
            )
            .orderBy(
              asc(laundryProduction.productionOrderStageAttempts.assignedAt),
              asc(laundryProduction.productionOrderStageAttempts.attemptNumber),
            );

    const attemptsByOrder = new Map<string, ProductionOrderRouteAttempt[]>();
    for (const row of attemptRows) {
      const attempt: ProductionOrderRouteAttempt = {
        id: row.id,
        productionRunId: row.productionRunId,
        stageRunId: row.stageRunId,
        productionBatchId: row.productionBatchId,
        batchSequence: row.batchSequence,
        batchStatus: asBatchStatus(row.batchStatus),
        stage: asStage(row.stageKind),
        stageStatus: asStageStatus(row.stageStatus),
        attemptNumber: row.attemptNumber,
        status: asAttemptStatus(row.status),
        assignmentReason: asAssignmentReason(row.assignmentReason),
        assignedAt: row.assignedAt.toISOString(),
        assignedBy: row.assignedBy,
        completedAt: row.completedAt?.toISOString() ?? null,
        completedBy: row.completedBy,
        releasedAt: row.releasedAt?.toISOString() ?? null,
        releasedBy: row.releasedBy,
        releaseReason: asRouteReason(row.releaseReason),
      };
      const attempts = attemptsByOrder.get(row.productionOrderId) ?? [];
      attempts.push(attempt);
      attemptsByOrder.set(row.productionOrderId, attempts);
    }

    const [attentionCount, activeCount, allCount] = await Promise.all([
      db
        .select({ value: count() })
        .from(laundryProduction.productionOrders)
        .innerJoin(
          laundryProduction.orderDemands,
          eq(
            laundryProduction.orderDemands.id,
            laundryProduction.productionOrders.orderDemandId,
          ),
        )
        .where(
          and(
            eq(
              laundryProduction.productionOrders.locationId,
              command.locationId,
            ),
            eq(laundryProduction.productionOrders.resolutionState, 'open'),
            attentionCondition,
          ),
        ),
      db
        .select({ value: count() })
        .from(laundryProduction.productionOrders)
        .innerJoin(
          laundryProduction.orderDemands,
          eq(
            laundryProduction.orderDemands.id,
            laundryProduction.productionOrders.orderDemandId,
          ),
        )
        .where(
          and(
            eq(
              laundryProduction.productionOrders.locationId,
              command.locationId,
            ),
            eq(laundryProduction.productionOrders.resolutionState, 'open'),
            activeCondition,
          ),
        ),
      db
        .select({ value: count() })
        .from(laundryProduction.productionOrders)
        .innerJoin(
          laundryProduction.orderDemands,
          eq(
            laundryProduction.orderDemands.id,
            laundryProduction.productionOrders.orderDemandId,
          ),
        )
        .where(
          and(
            eq(
              laundryProduction.productionOrders.locationId,
              command.locationId,
            ),
            eq(laundryProduction.productionOrders.resolutionState, 'open'),
            floorVisibleCondition,
          ),
        ),
    ]);

    const items: ProductionOrderControlItem[] = pageRows.map((row) => {
      const order = mapProductionOrderListItem(row, now, location.timezone);
      const attempts = attemptsByOrder.get(row.id) ?? [];
      const assigned = attempts
        .filter((attempt) => attempt.status === 'assigned')
        .sort(
          (left, right) =>
            left.batchSequence - right.batchSequence ||
            stageOrder(left.stage) - stageOrder(right.stage),
        );
      const hasPlacement =
        row.productionBatchId !== null &&
        row.placementProvenance !== null &&
        row.batchSequence !== null &&
        row.batchStatus !== null &&
        row.batchVersion !== null &&
        row.productionRunId !== null &&
        row.queueVersion !== null;
      const currentPlacement = hasPlacement
        ? {
            productionRunId: row.productionRunId!,
            productionBatchId: row.productionBatchId!,
            batchSequence: row.batchSequence!,
            batchStatus: asBatchStatus(row.batchStatus!),
            batchVersion: row.batchVersion!,
            queueVersion: row.queueVersion!,
            membershipFrozen: row.membershipFrozenAt !== null,
            placementProvenance: asPlacementProvenance(
              row.placementProvenance!,
            ),
            pinnedAt: row.pinnedAt?.toISOString() ?? null,
            pinnedBy: row.pinnedBy,
          }
        : null;
      const canMoveQueued =
        currentPlacement?.batchStatus === 'queued' &&
        !currentPlacement.membershipFrozen;
      const sourceState = asSourceAdmissionState(row.admissionState);
      const admissionOverride = asAdmissionOverride(row.admissionOverride);
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
            ...deps.policy.allowedProductionAdmissionActions({
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
        canMoveQueued,
        canRouteException:
          order.status === 'scheduled' &&
          currentPlacement !== null &&
          currentPlacement.batchStatus !== 'queued' &&
          currentPlacement.batchStatus !== 'finished',
      };
    });
    const last = pageRows.at(-1);

    return {
      tag: 'found',
      value: {
        items,
        counts: {
          attention: attentionCount[0]?.value ?? 0,
          active: activeCount[0]?.value ?? 0,
          all: allCount[0]?.value ?? 0,
        },
        nextCursor:
          hasNextPage && last !== undefined
            ? encodeProductionOrderControlCursor(filterKey, {
                dueAt: last.dueAt.toISOString(),
                id: last.id,
              })
            : null,
        asOf: now.toISOString(),
      },
    };
  },
});
