import { and, eq, sql } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { invariantViolationError } from '@pressly/errors/factories';
import type { Database, DatabaseExecutor } from '@pressly/db/client';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import type { IdSource } from '@pressly/kernel';
import { lockLocationScheduling } from '../../../foundations/adapters/postgres/commands/scheduling-locks.adapter.ts';
import {
  appendWorkEvent,
  findWorkEvent,
} from '../../../foundations/adapters/postgres/commands/work-events.adapter.ts';
import type {
  ChangeProductionAdmissionRepository,
  LockedProductionAdmission,
} from './change-production-admission.port.ts';
import type { ChangeProductionAdmissionResult } from './change-production-admission.model.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const asSourceAdmissionState = (
  value: string,
): LockedProductionAdmission['sourceAdmissionState'] => {
  switch (value) {
    case 'unreleased':
    case 'released':
    case 'withdrawn':
      return value;
    default:
      throw productionInvariantViolation(
        'production_admission_source_state_invalid',
        `Unknown fulfillment admission state: ${value}.`,
      );
  }
};

const asProductionStatus = (
  value: string,
): LockedProductionAdmission['productionStatus'] => {
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
        'production_admission_order_status_invalid',
        `Unknown production-order status: ${value}.`,
      );
  }
};

const asAdmissionOverride = (value: string | null): 'released' | null => {
  if (value === null || value === 'released') return value;
  throw productionInvariantViolation(
    'production_admission_override_invalid',
    `Unknown production admission override: ${value}.`,
  );
};

export const makeChangeProductionAdmissionRepository = (deps: {
  db: Database;
  ids: IdSource;
}): ChangeProductionAdmissionRepository =>
  defineUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    lockLocationScheduling: (locationId) =>
      lockLocationScheduling(db, locationId),

    lockOrder: async (locationId, orderId) => {
      const [row] = await db
        .select({
          order: laundryProduction.productionOrders,
          sourceAdmissionState: laundryProduction.orderDemands.admissionState,
          selectedForShift: sql<boolean>`exists (
            select 1
            from ${laundryProduction.productionShiftSelectedOrders} selected_order
            inner join ${laundryProduction.productionShifts} selected_shift
              on selected_shift.id = selected_order.production_shift_id
             and selected_shift.location_id = selected_order.location_id
            where selected_order.production_order_id = ${laundryProduction.productionOrders.id}
              and selected_order.location_id = ${locationId}
              and selected_shift.status = 'open'
          )`,
          hasActivePlacement: sql<boolean>`exists (
            select 1
            from ${laundryProduction.productionBatchOrders} active_placement
            where active_placement.production_order_id = ${laundryProduction.productionOrders.id}
              and active_placement.location_id = ${locationId}
              and active_placement.active = true
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
        sourceAdmissionState: asSourceAdmissionState(row.sourceAdmissionState),
        productionStatus: asProductionStatus(row.order.operationalStatus),
        productionVersion: row.order.version,
        executionStatus: row.order.executionStatus,
        derivedWeightLbs: row.order.derivedWeightLbs,
        admissionOverride: asAdmissionOverride(row.order.admissionOverride),
        bagCount: row.order.bagCount,
        selectedForShift: row.selectedForShift,
        hasActivePlacement: row.hasActivePlacement,
        resolutionState: row.order.resolutionState,
      };
    },

    changeAdmission: async ({
      locationId,
      orderId,
      actorId,
      expectedVersion,
      admissionOverride,
      nextStatus,
      now,
    }) => {
      const [updated] = await db
        .update(laundryProduction.productionOrders)
        .set({
          admissionOverride,
          admissionOverrideAt: admissionOverride === null ? null : now,
          admissionOverrideBy: admissionOverride === null ? null : actorId,
          operationalStatus: nextStatus,
          eligibleAt: nextStatus === 'eligible' ? now : null,
          version: expectedVersion + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(laundryProduction.productionOrders.locationId, locationId),
            eq(laundryProduction.productionOrders.id, orderId),
            eq(laundryProduction.productionOrders.version, expectedVersion),
            eq(laundryProduction.productionOrders.resolutionState, 'open'),
          ),
        )
        .returning({
          locationId: laundryProduction.productionOrders.locationId,
          orderId: laundryProduction.productionOrders.id,
          admissionOverride:
            laundryProduction.productionOrders.admissionOverride,
          status: laundryProduction.productionOrders.operationalStatus,
          version: laundryProduction.productionOrders.version,
        });
      if (updated === undefined) return null;

      return {
        locationId: updated.locationId,
        orderId: updated.orderId,
        admissionOverride: asAdmissionOverride(updated.admissionOverride),
        status: asProductionStatus(updated.status),
        version: updated.version,
        replayed: false,
      } satisfies ChangeProductionAdmissionResult;
    },

    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
