import { and, eq } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { invariantViolationError } from '@pressly/errors/factories';
import type { Database, DatabaseExecutor } from '@pressly/db/client';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import type { IdSource } from '@pressly/kernel';
import {
  appendWorkEvent,
  findWorkEvent,
} from '../../../foundations/adapters/postgres/commands/work-events.adapter.ts';
import { lockLocationScheduling } from '../../../foundations/adapters/postgres/commands/scheduling-locks.adapter.ts';
import type { RecordOrderIntakeRepository } from './record-order-intake.port.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

export const makeRecordOrderIntakeRepository = (deps: {
  db: Database;
  ids: IdSource;
}): RecordOrderIntakeRepository =>
  defineUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    lockLocationScheduling: (locationId) =>
      lockLocationScheduling(db, locationId),

    lockOrder: async (locationId, orderId) => {
      const [row] = await db
        .select({
          order: laundryProduction.productionOrders,
          demandPhase: laundryProduction.orderDemands.phase,
        })
        .from(laundryProduction.productionOrders)
        .innerJoin(
          laundryProduction.orderDemands,
          and(
            eq(
              laundryProduction.productionOrders.orderDemandId,
              laundryProduction.orderDemands.id,
            ),
            eq(
              laundryProduction.productionOrders.locationId,
              laundryProduction.orderDemands.locationId,
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
      if (
        row.demandPhase !== 'expected' &&
        row.demandPhase !== 'inbound' &&
        row.demandPhase !== 'production_released' &&
        row.demandPhase !== 'post_production' &&
        row.demandPhase !== 'withdrawn'
      )
        throw productionInvariantViolation(
          'production_order_intake_demand_phase_invalid',
          `Unknown order-demand phase: ${row.demandPhase}.`,
        );
      if (
        row.order.admissionOverride !== null &&
        row.order.admissionOverride !== 'released'
      )
        throw productionInvariantViolation(
          'production_order_intake_admission_override_invalid',
          `Unknown production admission override: ${row.order.admissionOverride}.`,
        );

      return {
        orderId: row.order.id,
        locationId: row.order.locationId,
        productionStatus: row.order.operationalStatus,
        productionVersion: row.order.version,
        intakeVersion: row.order.intakeVersion,
        derivedWeightLbs: row.order.derivedWeightLbs,
        demandPhase: row.demandPhase,
        admissionOverride: row.order.admissionOverride,
        executionStatus: row.order.executionStatus,
        resolutionState: row.order.resolutionState,
      };
    },

    recordIntake: async ({
      locationId,
      orderId,
      bagCount,
      expectedVersion,
      currentIntakeVersion,
      nextStatus,
      now,
    }) => {
      const nextVersion = expectedVersion + 1;
      const nextIntakeVersion = currentIntakeVersion + 1;
      const [updated] = await db
        .update(laundryProduction.productionOrders)
        .set({
          bagCount,
          bagCountSource: 'operator_intake',
          intakeRecordedAt: now,
          intakeVersion: nextIntakeVersion,
          operationalStatus: nextStatus,
          eligibleAt: nextStatus === 'eligible' ? now : null,
          version: nextVersion,
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
          orderId: laundryProduction.productionOrders.id,
          locationId: laundryProduction.productionOrders.locationId,
          bagCount: laundryProduction.productionOrders.bagCount,
          intakeVersion: laundryProduction.productionOrders.intakeVersion,
          version: laundryProduction.productionOrders.version,
        });
      if (updated === undefined || updated.bagCount === null) return null;

      await db
        .delete(laundryProduction.bags)
        .where(eq(laundryProduction.bags.productionOrderId, orderId));
      if (bagCount > 0)
        await db.insert(laundryProduction.bags).values(
          Array.from({ length: bagCount }, (_, bagIndex) => ({
            id: deps.ids.next(),
            productionOrderId: orderId,
            bagIndex,
            status: 'eligible',
          })),
        );

      return {
        locationId: updated.locationId,
        orderId: updated.orderId,
        bagCount: updated.bagCount,
        bagCountProvenance: 'operator_intake',
        intakeVersion: updated.intakeVersion,
        version: updated.version,
        replayed: false,
      };
    },

    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
