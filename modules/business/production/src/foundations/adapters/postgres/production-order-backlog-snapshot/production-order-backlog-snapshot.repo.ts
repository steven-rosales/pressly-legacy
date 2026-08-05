import type { DatabaseExecutor } from '@pressly/db/client';
import { and, asc, eq, gt, lte, or, sql } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { invariantViolationError } from '@pressly/errors/factories';
import { hasAnyProductionOrderSelectionEvidence } from '../orders/production-order-scheduling-evidence.adapter.ts';
import type {
  ProductionOrderBacklogSnapshotOrder,
  ProductionOrderBacklogSnapshotScope,
} from '../../../language/production-order-backlog/production-order-backlog.model.ts';
import type { ProductionOrderBacklogSnapshotReader } from '../../../ports/production-order-backlog-snapshot/production-order-backlog-snapshot.port.ts';

type SnapshotLock = 'none' | 'for_update';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const asResolutionState = (
  value: string,
): ProductionOrderBacklogSnapshotOrder['resolutionState'] => {
  if (value === 'open' || value === 'resolved_without_production') return value;
  throw productionInvariantViolation(
    'production_backlog_resolution_state_invalid',
    `Unknown production-order resolution state: ${value}.`,
  );
};

const afterCursor = (input: ProductionOrderBacklogSnapshotScope) =>
  input.after === null
    ? undefined
    : or(
        gt(laundryProduction.productionOrders.dueAt, input.after.dueAt),
        and(
          eq(laundryProduction.productionOrders.dueAt, input.after.dueAt),
          gt(laundryProduction.productionOrders.id, input.after.orderId),
        ),
      );

export const makeProductionOrderBacklogSnapshotReader =
  (
    db: DatabaseExecutor,
    lock: SnapshotLock = 'none',
  ): ProductionOrderBacklogSnapshotReader =>
  async (input) => {
    const query = db
      .select({
        order: laundryProduction.productionOrders,
        displayReference: laundryProduction.orderDemands.displayReference,
        hasShiftSelection: hasAnyProductionOrderSelectionEvidence({
          locationId: input.locationId,
          productionOrderId: laundryProduction.productionOrders.id,
        }),
        hasBatchMembership: sql<boolean>`exists (
          select 1
          from ${laundryProduction.productionBatchOrders} membership_history
          where membership_history.production_order_id = ${laundryProduction.productionOrders.id}
            and membership_history.location_id = ${input.locationId}
        )`,
        hasStageAttempt: sql<boolean>`exists (
          select 1
          from ${laundryProduction.productionOrderStageAttempts} attempt_history
          where attempt_history.production_order_id = ${laundryProduction.productionOrders.id}
            and attempt_history.location_id = ${input.locationId}
        )`,
        hasRoute: sql<boolean>`exists (
          select 1
          from ${laundryProduction.workEvents} route_event
          where route_event.entity_type = 'production_order'
            and route_event.entity_id = ${laundryProduction.productionOrders.id}
            and route_event.location_id = ${input.locationId}
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
      .where(
        and(
          eq(laundryProduction.productionOrders.locationId, input.locationId),
          lte(laundryProduction.productionOrders.dueAt, input.cutoff),
          afterCursor(input),
        ),
      )
      .orderBy(
        asc(laundryProduction.productionOrders.dueAt),
        asc(laundryProduction.productionOrders.id),
      )
      .limit(input.maxOrders + 1);

    const rows =
      lock === 'for_update' ? await query.for('update') : await query;
    return {
      hasMore: rows.length > input.maxOrders,
      orders: rows.slice(0, input.maxOrders).map((row) => ({
        orderId: row.order.id,
        locationId: row.order.locationId,
        displayReference: row.displayReference,
        dueAt: row.order.dueAt,
        productionVersion: row.order.version,
        resolutionState: asResolutionState(row.order.resolutionState),
        executionStatus: row.order.executionStatus,
        operationalStatus: row.order.operationalStatus,
        hasIntake:
          row.order.intakeVersion > 0 ||
          row.order.intakeRecordedAt !== null ||
          row.order.bagCount !== null,
        hasManualAdmission: row.order.admissionOverride !== null,
        isPriority: row.order.priority,
        hasPendingPlacement: row.order.pendingPlacement !== null,
        hasShiftSelection: row.hasShiftSelection,
        hasBatchMembership: row.hasBatchMembership,
        hasStageAttempt: row.hasStageAttempt,
        hasRoute: row.hasRoute,
      })),
    };
  };
