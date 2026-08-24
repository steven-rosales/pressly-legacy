import type { PostgresExecutor } from '@pressly/postgres/client';
import { and, asc, eq, gt, lte, or, sql } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../schema/production-schema.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  ProductionOrderBacklogSnapshotReader,
  ProductionOrderBacklogSnapshotOrder,
  ProductionOrderBacklogSnapshotScope,
} from './model.ts';

export type ProductionOrderBacklogSnapshotLock = 'none' | 'for_update';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const resolutionState = (
  value: string,
): ProductionOrderBacklogSnapshotOrder['resolutionState'] => {
  if (value === 'open' || value === 'resolved_without_production') return value;
  throw productionInvariantViolation(
    'production_backlog_resolution_state_invalid',
    `Unknown production-order resolution state: ${value}.`,
  );
};

const afterCursor = (
  input: ProductionOrderBacklogSnapshotScope,
  schema: ProductionSchema,
) =>
  input.after === null
    ? undefined
    : or(
        gt(schema.productionOrders.dueAt, input.after.dueAt),
        and(
          eq(schema.productionOrders.dueAt, input.after.dueAt),
          gt(schema.productionOrders.id, input.after.orderId),
        ),
      );

const hasShiftSelectionEvidence = (
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
        jsonb_build_array(
          jsonb_build_object('id', ${input.productionOrderId})
        )
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

export const makeProductionOrderBacklogSnapshotReader =
  (
    db: PostgresExecutor,
    schema: ProductionSchema,
    lock: ProductionOrderBacklogSnapshotLock = 'none',
  ): ProductionOrderBacklogSnapshotReader =>
  async (input) => {
    const query = db
      .select({
        order: schema.productionOrders,
        displayReference: schema.orderDemands.displayReference,
        hasShiftSelection: hasShiftSelectionEvidence(
          {
            locationId: input.locationId,
            productionOrderId: schema.productionOrders.id,
          },
          schema,
        ),
        hasBatchMembership: sql<boolean>`exists (
          select 1
          from ${schema.productionBatchOrders} membership_history
          where membership_history.production_order_id = ${schema.productionOrders.id}
            and membership_history.location_id = ${input.locationId}
        )`,
        hasStageAttempt: sql<boolean>`exists (
          select 1
          from ${schema.productionOrderStageAttempts} attempt_history
          where attempt_history.production_order_id = ${schema.productionOrders.id}
            and attempt_history.location_id = ${input.locationId}
        )`,
        hasRoute: sql<boolean>`exists (
          select 1
          from ${schema.workEvents} route_event
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
      .where(
        and(
          eq(schema.productionOrders.locationId, input.locationId),
          lte(schema.productionOrders.dueAt, input.cutoff),
          afterCursor(input, schema),
        ),
      )
      .orderBy(
        asc(schema.productionOrders.dueAt),
        asc(schema.productionOrders.id),
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
        resolutionState: resolutionState(row.order.resolutionState),
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
