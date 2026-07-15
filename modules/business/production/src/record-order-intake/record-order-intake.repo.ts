import {
  and,
  eq,
  laundryProduction,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import type { IdPort } from '../production.port.ts';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';
import { lockLocationScheduling } from '../persistence/scheduling-locks.ts';
import type { RecordOrderIntakeRepository } from './record-order-intake.port.ts';

export const makeRecordOrderIntakeRepository = (deps: {
  db: Database;
  ids: IdPort;
}): RecordOrderIntakeRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    lockLocationScheduling: (locationId) =>
      lockLocationScheduling(db, locationId),

    lockOrder: async (locationId, orderId) => {
      const [row] = await db
        .select({
          order: laundryProduction.productionOrders,
          demandState: laundryProduction.orderDemands.status,
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
        row.demandState !== 'ready_for_production' &&
        row.demandState !== 'not_ready'
      )
        throw new Error(`Unknown order-demand state: ${row.demandState}.`);

      return {
        orderId: row.order.id,
        locationId: row.order.locationId,
        productionStatus: row.order.status,
        productionVersion: row.order.version,
        intakeVersion: row.order.intakeVersion,
        derivedWeightLbs: row.order.derivedWeightLbs,
        demandState: row.demandState,
      };
    },

    recordIntake: async ({
      locationId,
      orderId,
      bagCount,
      expectedVersion,
      currentIntakeVersion,
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
          status: 'eligible',
          eligibleAt: now,
          version: nextVersion,
          updatedAt: now,
        })
        .where(
          and(
            eq(laundryProduction.productionOrders.locationId, locationId),
            eq(laundryProduction.productionOrders.id, orderId),
            eq(laundryProduction.productionOrders.version, expectedVersion),
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
