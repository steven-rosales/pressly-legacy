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
} from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { invariantViolationError } from '@pressly/errors/factories';
import type { Database } from '@pressly/db/client';
import type { ProductionRules } from '../../../foundations/language/rules/production-rules.model.ts';
import { mapProductionOrderListItem } from '../../../foundations/language/orders/production-order-list-item.projection.ts';
import { hasAnyProductionOrderSelectionEvidence } from '../../../foundations/adapters/postgres/orders/production-order-scheduling-evidence.adapter.ts';
import { productionDueFilter } from '../../../foundations/language/due-dates/production-due-bucket.policy.ts';
import {
  assessProductionOrderResolution,
  toProductionOrderResolutionAvailability,
} from '../../../foundations/language/resolution/production-order-resolution.policy.ts';
import {
  assessProductionOrderCommandCapabilities,
  type ProductionOrderCommandCapabilityContext,
} from './production-order-command-capability.policy.ts';
import { productionOrderControlCursor } from './production-order-control-cursor.value.ts';
import type {
  ProductionOrderControlItem,
  ProductionOrderRouteAttempt,
} from './list-production-order-control.model.ts';
import type { ListProductionOrderControlRepository } from './list-production-order-control.port.ts';

const stageOrder = (stage: ProductionOrderRouteAttempt['stage']): number => {
  switch (stage) {
    case 'sorting':
      return 0;
    case 'washing':
      return 1;
    case 'drying':
      return 2;
    case 'folding_packaging':
      return 3;
  }
};

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

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
      throw productionInvariantViolation(
        'production_order_control_placement_provenance_invalid',
        `Unknown production placement provenance: ${value}.`,
      );
  }
};

type RoutableBatchStatus =
  | 'queued'
  | 'sorting'
  | 'washing'
  | 'drying'
  | 'folding_packaging'
  | 'finished';

const asBatchStatus = (value: string): RoutableBatchStatus => {
  switch (value) {
    case 'queued':
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding_packaging':
    case 'finished':
      return value;
    default:
      throw productionInvariantViolation(
        'production_order_control_batch_status_invalid',
        `Unknown production batch status: ${value}.`,
      );
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
      throw productionInvariantViolation(
        'production_order_control_stage_invalid',
        `Unknown production stage: ${value}.`,
      );
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
      throw productionInvariantViolation(
        'production_order_control_stage_status_invalid',
        `Unknown stage-run status: ${value}.`,
      );
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
      throw productionInvariantViolation(
        'production_order_control_attempt_status_invalid',
        `Unknown order-stage attempt status: ${value}.`,
      );
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
      throw productionInvariantViolation(
        'production_order_control_assignment_reason_invalid',
        `Unknown order-stage assignment reason: ${value}.`,
      );
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
      throw productionInvariantViolation(
        'production_order_control_release_reason_invalid',
        `Unknown order-stage release reason: ${value}.`,
      );
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
      throw productionInvariantViolation(
        'production_order_control_admission_state_invalid',
        `Unknown source admission state: ${value}.`,
      );
  }
};

const asAdmissionOverride = (value: string | null): 'released' | null => {
  if (value === null || value === 'released') return value;
  throw productionInvariantViolation(
    'production_order_control_admission_override_invalid',
    `Unknown production admission override: ${value}.`,
  );
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
  deps: Readonly<{ db: Database; policy: ProductionRules }>,
): ListProductionOrderControlRepository => ({
  list: async (command, now) => {
    const db = deps.db;
    const cursor =
      command.cursor === undefined
        ? undefined
        : productionOrderControlCursor.decode(command.cursor, command);
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
            gt(laundryProduction.productionOrders.dueAt, cursor.dueAt),
            and(
              eq(laundryProduction.productionOrders.dueAt, cursor.dueAt),
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
        intakeRecordedAt: laundryProduction.productionOrders.intakeRecordedAt,
        version: laundryProduction.productionOrders.version,
        resolutionState: laundryProduction.productionOrders.resolutionState,
        executionStatus: laundryProduction.productionOrders.executionStatus,
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
        productionRunStatus: laundryProduction.productionRuns.status,
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
        resolutionHasShiftSelection: hasAnyProductionOrderSelectionEvidence({
          locationId: command.locationId,
          productionOrderId: laundryProduction.productionOrders.id,
        }),
        hasBatchMembership: sql<boolean>`exists (
          select 1
          from ${laundryProduction.productionBatchOrders} membership_history
          where membership_history.production_order_id = ${laundryProduction.productionOrders.id}
            and membership_history.location_id = ${command.locationId}
        )`,
        hasStageAttempt: sql<boolean>`exists (
          select 1
          from ${laundryProduction.productionOrderStageAttempts} attempt_history
          where attempt_history.production_order_id = ${laundryProduction.productionOrders.id}
            and attempt_history.location_id = ${command.locationId}
        )`,
        hasRoute: sql<boolean>`exists (
          select 1
          from ${laundryProduction.workEvents} route_event
          where route_event.entity_type = 'production_order'
            and route_event.entity_id = ${laundryProduction.productionOrders.id}
            and route_event.location_id = ${command.locationId}
            and route_event.event_type in (
              'production_order_rebatched',
              'production_order_route_exception_recorded'
            )
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
        : await db
            .select({
              id: laundryProduction.productionBatches.id,
              productionRunId:
                laundryProduction.productionBatches.productionRunId,
              sequence: laundryProduction.productionBatches.sequenceIndex,
              status: laundryProduction.productionBatches.status,
              membershipFrozenAt:
                laundryProduction.productionBatches.membershipFrozenAt,
              version: laundryProduction.productionBatches.version,
              derivedWeightLbs:
                laundryProduction.productionBatches.derivedWeightLbs,
              pulseCapacityLbs:
                laundryProduction.productionBatches.pulseCapacityLbs,
            })
            .from(laundryProduction.productionBatches)
            .where(
              and(
                eq(
                  laundryProduction.productionBatches.locationId,
                  command.locationId,
                ),
                inArray(
                  laundryProduction.productionBatches.productionRunId,
                  productionRunIds,
                ),
              ),
            )
            .orderBy(asc(laundryProduction.productionBatches.sequenceIndex));
    const routingBatchIds = routingBatchRows.map((batch) => batch.id);
    const [routingStageRows, activeMembershipRows] =
      routingBatchIds.length === 0
        ? [[], []]
        : await Promise.all([
            db
              .select({
                id: laundryProduction.stageRuns.id,
                productionBatchId:
                  laundryProduction.stageRuns.productionBatchId,
                stageKind: laundryProduction.stageRuns.stageKind,
                status: laundryProduction.stageRuns.status,
              })
              .from(laundryProduction.stageRuns)
              .where(
                and(
                  eq(
                    laundryProduction.stageRuns.locationId,
                    command.locationId,
                  ),
                  inArray(
                    laundryProduction.stageRuns.productionBatchId,
                    routingBatchIds,
                  ),
                ),
              ),
            db
              .select({
                productionBatchId:
                  laundryProduction.productionBatchOrders.productionBatchId,
              })
              .from(laundryProduction.productionBatchOrders)
              .where(
                and(
                  eq(
                    laundryProduction.productionBatchOrders.locationId,
                    command.locationId,
                  ),
                  inArray(
                    laundryProduction.productionBatchOrders.productionBatchId,
                    routingBatchIds,
                  ),
                  eq(laundryProduction.productionBatchOrders.active, true),
                ),
              ),
          ]);
    const routingStageIds = routingStageRows.map((stage) => stage.id);
    const [assignedWeightRows, machineCapacityRows] =
      routingStageIds.length === 0
        ? [[], []]
        : await Promise.all([
            db
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
                    command.locationId,
                  ),
                  eq(
                    laundryProduction.productionOrderStageAttempts.status,
                    'assigned',
                  ),
                  inArray(
                    laundryProduction.productionOrderStageAttempts.stageRunId,
                    routingStageIds,
                  ),
                ),
              ),
            db
              .select({
                stageRunId:
                  laundryProduction.stageMachineAssignments.stageRunId,
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
                  eq(
                    laundryProduction.stageMachineAssignments.locationId,
                    command.locationId,
                  ),
                  eq(
                    laundryProduction.stageMachineAssignments.status,
                    'planned',
                  ),
                  eq(laundryProduction.machines.isActive, true),
                  inArray(
                    laundryProduction.stageMachineAssignments.stageRunId,
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
        throw productionInvariantViolation(
          'production_order_control_routing_batch_missing',
          'Routing stage is missing its production batch.',
        );
      const stages = routingStagesByBatch.get(stage.productionBatchId) ?? [];
      const stageKind = asStage(stage.stageKind);
      const stageStatus = asStageStatus(stage.status);
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
          status: asBatchStatus(batch.status),
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
        batchStatus: asBatchStatus(row.batchStatus),
        stage: asStage(row.stageKind),
        stageStatus: asStageStatus(row.stageStatus),
        attemptNumber: row.attemptNumber,
        status: asAttemptStatus(row.status),
        assignmentReason: asAssignmentReason(row.assignmentReason),
        assignedAt: row.assignedAt,
        assignedBy: row.assignedBy,
        completedAt: row.completedAt,
        completedBy: row.completedBy,
        releasedAt: row.releasedAt,
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
      const commands = assessProductionOrderCommandCapabilities(deps.policy, {
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
      const sourceState = asSourceAdmissionState(row.admissionState);
      const admissionOverride = asAdmissionOverride(row.admissionOverride);
      const effectiveState =
        sourceState === 'withdrawn'
          ? 'withdrawn'
          : admissionOverride === 'released'
            ? 'released'
            : sourceState;
      const resolutionAction = toProductionOrderResolutionAvailability(
        assessProductionOrderResolution(deps.policy, {
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
      );
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
        commands,
        resolutionAction,
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
            ? productionOrderControlCursor.encode(command, {
                dueAt: last.dueAt,
                id: last.id,
              })
            : null,
        asOf: now,
      },
    };
  },
});
