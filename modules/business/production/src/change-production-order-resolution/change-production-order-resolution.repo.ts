import type { ChangeProductionOrderResolutionResult } from '@pressly/contracts';
import {
  and,
  eq,
  laundryProduction,
  sql,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import {
  hasCurrentProductionOrderSelection,
  hasHistoricalProductionOrderSelectionEvidence,
} from '../persistence/production-order-scheduling-evidence.ts';
import { lockLocationScheduling } from '../persistence/scheduling-locks.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';
import type {
  ChangeProductionOrderResolutionRepository,
  LockedProductionOrderResolution,
} from './change-production-order-resolution.port.ts';

const asOperationalStatus = (
  value: string,
): LockedProductionOrderResolution['operationalStatus'] => {
  switch (value) {
    case 'release_pending':
    case 'intake_pending':
    case 'eligible':
    case 'ineligible':
    case 'scheduled':
    case 'finished':
      return value;
    default:
      throw new Error(`Unknown production-order status: ${value}.`);
  }
};

const asAdmissionState = (
  value: string,
): LockedProductionOrderResolution['sourceAdmissionState'] => {
  switch (value) {
    case 'unreleased':
    case 'released':
    case 'withdrawn':
      return value;
    default:
      throw new Error(`Unknown fulfillment admission state: ${value}.`);
  }
};

const asCommercialState = (
  value: string,
): LockedProductionOrderResolution['sourceCommercialState'] => {
  switch (value) {
    case 'open':
    case 'completed':
    case 'canceled':
      return value;
    default:
      throw new Error(`Unknown commercial order state: ${value}.`);
  }
};

const asDemandPhase = (
  value: string,
): LockedProductionOrderResolution['demandPhase'] => {
  switch (value) {
    case 'expected':
    case 'inbound':
    case 'production_released':
    case 'post_production':
    case 'withdrawn':
      return value;
    default:
      throw new Error(`Unknown demand phase: ${value}.`);
  }
};

const asAdmissionOverride = (value: string | null): 'released' | null => {
  if (value === null || value === 'released') return value;
  throw new Error(`Unknown production admission override: ${value}.`);
};

const asResolutionState = (
  value: string,
): 'open' | 'resolved_without_production' => {
  if (value === 'open' || value === 'resolved_without_production') return value;
  throw new Error(`Unknown production-order resolution state: ${value}.`);
};

export const makeChangeProductionOrderResolutionRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): ChangeProductionOrderResolutionRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    lockLocationScheduling: (locationId) =>
      lockLocationScheduling(db, locationId),

    lockOrder: async (locationId, orderId) => {
      const [row] = await db
        .select({
          order: laundryProduction.productionOrders,
          sourceAdmissionState: laundryProduction.orderDemands.admissionState,
          sourceCommercialState: laundryProduction.orderDemands.commercialState,
          demandPhase: laundryProduction.orderDemands.phase,
          sourceDueAt: laundryProduction.orderDemands.dueAt,
          sourceEstimatedWeightLbs:
            laundryProduction.orderDemands.estimatedWeightLbs,
          sourceEstimatedWeightSource:
            laundryProduction.orderDemands.estimatedWeightSource,
          hasShiftSelection: hasCurrentProductionOrderSelection({
            locationId,
            productionOrderId: laundryProduction.productionOrders.id,
          }),
          hasHistoricalPlanSelection:
            hasHistoricalProductionOrderSelectionEvidence({
              locationId,
              productionOrderId: laundryProduction.productionOrders.id,
            }),
          hasBatchMembership: sql<boolean>`exists (
            select 1
            from ${laundryProduction.productionBatchOrders} membership_history
            where membership_history.production_order_id = ${laundryProduction.productionOrders.id}
              and membership_history.location_id = ${locationId}
          )`,
          hasStageAttempt: sql<boolean>`exists (
            select 1
            from ${laundryProduction.productionOrderStageAttempts} attempt_history
            where attempt_history.production_order_id = ${laundryProduction.productionOrders.id}
              and attempt_history.location_id = ${locationId}
          )`,
          hasRoute: sql<boolean>`exists (
            select 1
            from ${laundryProduction.workEvents} route_event
            where route_event.entity_type = 'production_order'
              and route_event.entity_id = ${laundryProduction.productionOrders.id}
              and route_event.location_id = ${locationId}
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
            eq(laundryProduction.productionOrders.locationId, locationId),
            eq(laundryProduction.productionOrders.id, orderId),
          ),
        )
        .limit(1)
        .for('update');
      if (row === undefined) return null;

      return {
        orderId: row.order.id,
        locationId: row.order.locationId,
        productionVersion: row.order.version,
        resolutionState: row.order.resolutionState,
        executionStatus: row.order.executionStatus,
        operationalStatus: asOperationalStatus(row.order.operationalStatus),
        sourceAdmissionState: asAdmissionState(row.sourceAdmissionState),
        sourceCommercialState: asCommercialState(row.sourceCommercialState),
        demandPhase: asDemandPhase(row.demandPhase),
        sourceDueAt: row.sourceDueAt,
        sourceEstimatedWeightLbs: row.sourceEstimatedWeightLbs,
        sourceEstimatedWeightSource: row.sourceEstimatedWeightSource,
        admissionOverride: asAdmissionOverride(row.order.admissionOverride),
        bagCount: row.order.bagCount,
        hasIntake:
          row.order.intakeVersion > 0 ||
          row.order.intakeRecordedAt !== null ||
          row.order.bagCount !== null,
        hasManualAdmission: row.order.admissionOverride !== null,
        isPriority: row.order.priority,
        hasPendingPlacement: row.order.pendingPlacement !== null,
        hasShiftSelection: row.hasShiftSelection,
        hasHistoricalPlanSelection: row.hasHistoricalPlanSelection,
        hasBatchMembership: row.hasBatchMembership,
        hasStageAttempt: row.hasStageAttempt,
        hasRoute: row.hasRoute,
      };
    },

    changeResolution: async ({
      locationId,
      orderId,
      actorId,
      expectedVersion,
      lifecycle,
      reason,
      note,
      clearPendingPlacement,
      restoredSourceProjection,
      now,
    }) => {
      const resolving = lifecycle.state === 'resolved_without_production';
      const [updated] = await db
        .update(laundryProduction.productionOrders)
        .set({
          resolutionState: lifecycle.state,
          resolvedAt: resolving ? now : null,
          resolvedBy: resolving ? actorId : null,
          resolutionReason: resolving ? reason : null,
          resolutionNote: resolving ? note : null,
          resolutionBulkOperationId: null,
          ...(clearPendingPlacement ? { pendingPlacement: null } : {}),
          ...(restoredSourceProjection === null
            ? {}
            : {
                dueAt: restoredSourceProjection.dueAt,
                derivedWeightLbs: restoredSourceProjection.derivedWeightLbs,
                derivedWeightSource:
                  restoredSourceProjection.derivedWeightSource,
                operationalStatus: restoredSourceProjection.operationalStatus,
                eligibleAt:
                  restoredSourceProjection.operationalStatus === 'eligible'
                    ? now
                    : null,
                ...(restoredSourceProjection.clearAdmissionOverride
                  ? {
                      admissionOverride: null,
                      admissionOverrideAt: null,
                      admissionOverrideBy: null,
                    }
                  : {}),
              }),
          version: expectedVersion + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(laundryProduction.productionOrders.locationId, locationId),
            eq(laundryProduction.productionOrders.id, orderId),
            eq(laundryProduction.productionOrders.version, expectedVersion),
            eq(
              laundryProduction.productionOrders.resolutionState,
              lifecycle.from,
            ),
          ),
        )
        .returning({
          locationId: laundryProduction.productionOrders.locationId,
          orderId: laundryProduction.productionOrders.id,
          resolutionState: laundryProduction.productionOrders.resolutionState,
          version: laundryProduction.productionOrders.version,
        });
      if (updated === undefined) return null;

      return {
        locationId: updated.locationId,
        orderId: updated.orderId,
        action: resolving ? 'resolve_without_production' : 'restore',
        resolutionState: asResolutionState(updated.resolutionState),
        transitionedAt: now.toISOString(),
        version: updated.version,
        replayed: false,
      } satisfies ChangeProductionOrderResolutionResult;
    },

    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
