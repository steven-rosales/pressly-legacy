import {
  and,
  eq,
  laundryProduction,
  sql,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';
import type {
  ApplyOrderDemandRepository,
  StoredOrderDemand,
} from './apply-order-demand.port.ts';

export const makeApplyOrderDemandRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): ApplyOrderDemandRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),

    locationIsActive: async (locationId) => {
      const [location] = await db
        .select({ id: laundryProduction.productionLocations.id })
        .from(laundryProduction.productionLocations)
        .where(
          and(
            eq(laundryProduction.productionLocations.id, locationId),
            eq(laundryProduction.productionLocations.isActive, true),
          ),
        )
        .limit(1);
      return location !== undefined;
    },

    lockDemand: async (demandKey) => {
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`order-demand:${demandKey}`}))`,
      );
    },

    loadDemand: async (demandKey) => {
      const [demand] = await db
        .select()
        .from(laundryProduction.orderDemands)
        .where(eq(laundryProduction.orderDemands.demandKey, demandKey))
        .limit(1);
      if (demand === undefined) return null;
      const [productionOrder] = await db
        .select({
          id: laundryProduction.productionOrders.id,
          bagCount: laundryProduction.productionOrders.bagCount,
          status: laundryProduction.productionOrders.status,
        })
        .from(laundryProduction.productionOrders)
        .where(eq(laundryProduction.productionOrders.orderDemandId, demand.id))
        .limit(1)
        .for('update');
      return {
        orderDemandId: demand.id,
        productionOrderId: productionOrder?.id ?? null,
        locationId: demand.locationId,
        revisionAt: demand.revisionAt.toISOString(),
        revisionHash: demand.revisionHash,
        bagCount: productionOrder?.bagCount ?? null,
        productionStatus: productionOrder?.status ?? null,
      };
    },

    applyDemand: async ({ command, orderDemandId, productionStatus, now }) => {
      const [storedDemand] = await db
        .select({ id: laundryProduction.orderDemands.id })
        .from(laundryProduction.orderDemands)
        .where(eq(laundryProduction.orderDemands.demandKey, command.demandKey))
        .limit(1);
      const revisionAt = new Date(command.revisionAt);
      const dueAt = new Date(command.dueAt);

      if (storedDemand === undefined)
        await db.insert(laundryProduction.orderDemands).values({
          id: orderDemandId,
          demandKey: command.demandKey,
          displayReference: command.displayReference,
          locationId: command.locationId,
          revisionHash: command.revisionHash,
          revisionAt,
          status: command.state,
          dueAt,
          createdAt: now,
          updatedAt: now,
        });
      else
        await db
          .update(laundryProduction.orderDemands)
          .set({
            displayReference: command.displayReference,
            revisionHash: command.revisionHash,
            revisionAt,
            status: command.state,
            dueAt,
            updatedAt: now,
          })
          .where(eq(laundryProduction.orderDemands.id, orderDemandId));

      const [existing] = await db
        .select()
        .from(laundryProduction.productionOrders)
        .where(
          eq(laundryProduction.productionOrders.orderDemandId, orderDemandId),
        )
        .limit(1)
        .for('update');

      if (existing === undefined && productionStatus !== 'ineligible') {
        const productionOrderId = deps.ids.next();
        await db.insert(laundryProduction.productionOrders).values({
          id: productionOrderId,
          orderDemandId,
          locationId: command.locationId,
          dueAt,
          priority: false,
          status: productionStatus,
          derivedWeightLbs: command.estimatedWeightLbs,
          derivedWeightSource: 'external_estimate',
          bagCount: command.bagCount,
          bagCountSource: command.bagCount === null ? null : 'external_source',
          intakeRecordedAt: command.bagCount === null ? null : now,
          intakeVersion: command.bagCount === null ? 0 : 1,
          mustStayTogether: true,
          version: 1,
          eligibleAt: now,
          createdAt: now,
          updatedAt: now,
        });
        return {
          orderDemandId,
          productionOrderId,
          locationId: command.locationId,
          revisionAt: command.revisionAt,
          revisionHash: command.revisionHash,
          bagCount: command.bagCount,
          productionStatus,
        } satisfies StoredOrderDemand;
      }

      if (existing === undefined)
        return {
          orderDemandId,
          productionOrderId: null,
          locationId: command.locationId,
          revisionAt: command.revisionAt,
          revisionHash: command.revisionHash,
          bagCount: null,
          productionStatus: null,
        } satisfies StoredOrderDemand;

      const adoptsSourceBagCount =
        existing.bagCount === null && command.bagCount !== null;
      const bagCount = existing.bagCount ?? command.bagCount;
      const [updated] = await db
        .update(laundryProduction.productionOrders)
        .set({
          dueAt,
          status: productionStatus,
          derivedWeightLbs: command.estimatedWeightLbs,
          ...(adoptsSourceBagCount
            ? {
                bagCount,
                bagCountSource: 'external_source',
                intakeRecordedAt: now,
                intakeVersion: existing.intakeVersion + 1,
              }
            : {}),
          version: existing.version + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(laundryProduction.productionOrders.id, existing.id),
            eq(laundryProduction.productionOrders.version, existing.version),
          ),
        )
        .returning({
          id: laundryProduction.productionOrders.id,
          bagCount: laundryProduction.productionOrders.bagCount,
          status: laundryProduction.productionOrders.status,
        });
      if (updated === undefined)
        throw new Error('Production order changed during demand application.');
      return {
        orderDemandId,
        productionOrderId: updated.id,
        locationId: command.locationId,
        revisionAt: command.revisionAt,
        revisionHash: command.revisionHash,
        bagCount: updated.bagCount,
        productionStatus: updated.status,
      } satisfies StoredOrderDemand;
    },

    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
