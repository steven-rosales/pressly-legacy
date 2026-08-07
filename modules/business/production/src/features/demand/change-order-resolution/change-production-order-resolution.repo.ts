import { and, eq, sql } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { invariantViolationError } from '@pressly/errors/factories';
import type { Database, DatabaseExecutor } from '@pressly/db/client';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import type { IdSource } from '@pressly/kernel';
import {
  hasCurrentProductionOrderSelection,
  hasHistoricalProductionOrderSelectionEvidence,
} from '../../../foundations/adapters/postgres/orders/production-order-scheduling-evidence.adapter.ts';
import { lockLocationScheduling } from '../../../foundations/adapters/postgres/commands/scheduling-locks.adapter.ts';
import {
  appendWorkEvent,
  findWorkEvent,
} from '../../../foundations/adapters/postgres/commands/work-events.adapter.ts';
import type {
  ChangeProductionOrderResolutionResult,
  LockedProductionOrderResolution,
} from './change-production-order-resolution.model.ts';
import type { ChangeProductionOrderResolutionRepository } from './change-production-order-resolution.port.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

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
      throw productionInvariantViolation(
        'production_order_resolution_status_invalid',
        `Unknown production-order status: ${value}.`,
      );
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
      throw productionInvariantViolation(
        'production_order_resolution_admission_state_invalid',
        `Unknown fulfillment admission state: ${value}.`,
      );
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
      throw productionInvariantViolation(
        'production_order_resolution_commercial_state_invalid',
        `Unknown commercial order state: ${value}.`,
      );
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
      throw productionInvariantViolation(
        'production_order_resolution_demand_phase_invalid',
        `Unknown demand phase: ${value}.`,
      );
  }
};

const asAdmissionOverride = (value: string | null): 'released' | null => {
  if (value === null || value === 'released') return value;
  throw productionInvariantViolation(
    'production_order_resolution_admission_override_invalid',
    `Unknown production admission override: ${value}.`,
  );
};

const asResolutionState = (
  value: string,
): 'open' | 'resolved_without_production' => {
  if (value === 'open' || value === 'resolved_without_production') return value;
  throw productionInvariantViolation(
    'production_order_resolution_state_invalid',
    `Unknown production-order resolution state: ${value}.`,
  );
};

export const makeChangeProductionOrderResolutionRepository = (deps: {
  db: Database;
  ids: IdSource;
}): ChangeProductionOrderResolutionRepository =>
  defineUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
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
