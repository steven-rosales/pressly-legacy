import type { CommitProductionOrderBacklogCommand } from '@pressly/contracts';
import {
  and,
  asc,
  eq,
  gt,
  laundryProduction,
  lte,
  or,
  sql,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import { hasAnyProductionOrderSelectionEvidence } from '../persistence/production-order-scheduling-evidence.ts';
import { lockLocationScheduling } from '../persistence/scheduling-locks.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';
import type {
  BacklogSnapshotScope,
  ProductionOrderBacklogSnapshot,
  ProductionOrderBacklogSnapshotOrder,
  ReviewProductionOrderBacklogRepository,
} from './review-production-order-backlog.port.ts';

const asResolutionState = (
  value: string,
): ProductionOrderBacklogSnapshotOrder['resolutionState'] => {
  if (value === 'open' || value === 'resolved_without_production') return value;
  throw new Error(`Unknown production-order resolution state: ${value}.`);
};

const afterCursor = (input: BacklogSnapshotScope) =>
  input.after === null
    ? undefined
    : or(
        gt(laundryProduction.productionOrders.dueAt, input.after.dueAt),
        and(
          eq(laundryProduction.productionOrders.dueAt, input.after.dueAt),
          gt(laundryProduction.productionOrders.id, input.after.orderId),
        ),
      );

const loadSnapshot = async (
  db: DatabaseExecutor,
  input: BacklogSnapshotScope,
  forUpdate: boolean,
): Promise<ProductionOrderBacklogSnapshot> => {
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

  const rows = forUpdate ? await query.for('update') : await query;
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

export const makeReviewProductionOrderBacklogRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): ReviewProductionOrderBacklogRepository => ({
  loadSnapshot: (input) => loadSnapshot(deps.db, input, false),
  ...makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey: string) =>
      findWorkEvent(db, idempotencyKey),
    lockLocationScheduling: (locationId: string) =>
      lockLocationScheduling(db, locationId),
    loadSnapshotForUpdate: (input: BacklogSnapshotScope) =>
      loadSnapshot(db, input, true),
    resolveOrder: async (input: {
      locationId: string;
      orderId: string;
      actorId: string;
      expectedVersion: number;
      lifecycle: Readonly<{
        from: 'open' | 'resolved_without_production';
        state: 'open' | 'resolved_without_production';
      }>;
      reason: CommitProductionOrderBacklogCommand['reason'];
      note: string | null;
      bulkOperationId: string;
      now: Date;
    }) => {
      if (input.lifecycle.state !== 'resolved_without_production')
        throw new Error(
          'Bulk backlog resolution can only persist the resolve transition.',
        );
      const [changed] = await db
        .update(laundryProduction.productionOrders)
        .set({
          resolutionState: input.lifecycle.state,
          resolvedAt: input.now,
          resolvedBy: input.actorId,
          resolutionReason: input.reason,
          resolutionNote: input.note,
          resolutionBulkOperationId: input.bulkOperationId,
          version: input.expectedVersion + 1,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(laundryProduction.productionOrders.locationId, input.locationId),
            eq(laundryProduction.productionOrders.id, input.orderId),
            eq(
              laundryProduction.productionOrders.version,
              input.expectedVersion,
            ),
            eq(
              laundryProduction.productionOrders.resolutionState,
              input.lifecycle.from,
            ),
          ),
        )
        .returning({
          orderId: laundryProduction.productionOrders.id,
          resolutionState: laundryProduction.productionOrders.resolutionState,
          version: laundryProduction.productionOrders.version,
        });
      if (changed === undefined) return null;
      if (changed.resolutionState !== 'resolved_without_production')
        throw new Error(
          `Unexpected bulk resolution state: ${changed.resolutionState}.`,
        );
      return {
        orderId: changed.orderId,
        resolutionState: changed.resolutionState,
        version: changed.version,
      } as const;
    },
    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  })),
});
