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
import { lockLocationScheduling } from '../persistence/scheduling-locks.ts';
import type {
  ApplyOrderDemandRepository,
  StoredOrderDemand,
} from './apply-order-demand.port.ts';

const mapDemandPhase = (value: string): StoredOrderDemand['phase'] => {
  switch (value) {
    case 'expected':
    case 'inbound':
    case 'production_released':
    case 'post_production':
    case 'withdrawn':
      return value;
    default:
      throw new Error(`Unknown order-demand phase: ${value}.`);
  }
};

const mapProductionStatus = (
  value: string | null,
): StoredOrderDemand['productionStatus'] => {
  switch (value) {
    case null:
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

const mapEstimatedWeightSource = (
  value: string | null,
): StoredOrderDemand['estimatedWeightSource'] => {
  if (value === null || value === 'external_estimate') return value;
  throw new Error(`Unknown demand weight provenance: ${value}.`);
};

export const makeApplyOrderDemandRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): ApplyOrderDemandRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    lockLocationScheduling: (locationId) =>
      lockLocationScheduling(db, locationId),

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
        phase: mapDemandPhase(demand.phase),
        sourceStatusCode: demand.sourceStatusCode,
        estimatedWeightLbs: demand.estimatedWeightLbs,
        estimatedWeightSource: mapEstimatedWeightSource(
          demand.estimatedWeightSource,
        ),
        bagCount: productionOrder?.bagCount ?? null,
        productionStatus: mapProductionStatus(productionOrder?.status ?? null),
      };
    },

    applyDemand: async ({
      command,
      orderDemandId,
      production,
      effectiveBagCount,
      now,
    }) => {
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
          phase: command.phase,
          sourceStatusCode: command.sourceStatusCode,
          estimatedWeightLbs: command.estimatedWeightLbs,
          estimatedWeightSource: command.estimatedWeightSource,
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
            phase: command.phase,
            sourceStatusCode: command.sourceStatusCode,
            estimatedWeightLbs: command.estimatedWeightLbs,
            estimatedWeightSource: command.estimatedWeightSource,
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

      const stored = (
        productionOrderId: string | null,
        bagCount: number | null,
        productionStatus: StoredOrderDemand['productionStatus'],
      ): StoredOrderDemand => ({
        orderDemandId,
        productionOrderId,
        locationId: command.locationId,
        revisionAt: command.revisionAt,
        revisionHash: command.revisionHash,
        phase: command.phase,
        sourceStatusCode: command.sourceStatusCode,
        estimatedWeightLbs: command.estimatedWeightLbs,
        estimatedWeightSource: command.estimatedWeightSource,
        bagCount,
        productionStatus,
      });

      if (production.action === 'none') {
        if (existing !== undefined)
          throw new Error('A no-op demand projection found production work.');
        return stored(null, null, null);
      }

      if (production.action === 'preserve') {
        if (existing === undefined)
          throw new Error('A preserved demand is missing production work.');
        return stored(
          existing.id,
          existing.bagCount,
          mapProductionStatus(existing.status),
        );
      }

      if (production.action === 'create') {
        if (existing !== undefined)
          throw new Error('A new demand projection found production work.');
        if (
          command.estimatedWeightLbs === null ||
          command.estimatedWeightSource === null
        )
          throw new Error('Production work requires a positive estimate.');
        if (
          (production.status === 'intake_pending' &&
            effectiveBagCount !== null) ||
          (production.status === 'eligible' && effectiveBagCount === null)
        )
          throw new Error('Demand lifecycle and intake state disagree.');

        const productionOrderId = deps.ids.next();
        await db.insert(laundryProduction.productionOrders).values({
          id: productionOrderId,
          orderDemandId,
          locationId: command.locationId,
          dueAt,
          priority: false,
          status: production.status,
          derivedWeightLbs: command.estimatedWeightLbs,
          derivedWeightSource: command.estimatedWeightSource,
          bagCount: effectiveBagCount,
          bagCountSource: effectiveBagCount === null ? null : 'external_source',
          intakeRecordedAt: effectiveBagCount === null ? null : now,
          intakeVersion: effectiveBagCount === null ? 0 : 1,
          mustStayTogether: true,
          version: 1,
          eligibleAt: production.status === 'eligible' ? now : null,
          createdAt: now,
          updatedAt: now,
        });
        if (effectiveBagCount !== null && effectiveBagCount > 0)
          await db.insert(laundryProduction.bags).values(
            Array.from({ length: effectiveBagCount }, (_, bagIndex) => ({
              id: deps.ids.next(),
              productionOrderId,
              bagIndex,
              status: 'eligible',
            })),
          );
        return stored(productionOrderId, effectiveBagCount, production.status);
      }

      if (existing === undefined)
        throw new Error('An updated demand is missing production work.');

      const adoptsSourceBagCount =
        existing.bagCount === null && command.bagCount !== null;
      const bagCount = existing.bagCount ?? command.bagCount;
      const derivedWeightLbs =
        command.estimatedWeightLbs ?? Number(existing.derivedWeightLbs);
      const derivedWeightSource =
        command.estimatedWeightSource ??
        mapEstimatedWeightSource(existing.derivedWeightSource);
      if (derivedWeightSource === null)
        throw new Error(
          'Existing production work is missing weight provenance.',
        );
      if (bagCount !== effectiveBagCount)
        throw new Error('Demand lifecycle and persisted intake disagree.');
      const [updated] = await db
        .update(laundryProduction.productionOrders)
        .set({
          dueAt,
          status: production.status,
          derivedWeightLbs,
          derivedWeightSource,
          eligibleAt:
            production.status === 'eligible'
              ? (existing.eligibleAt ?? now)
              : null,
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
      if (adoptsSourceBagCount && bagCount !== null) {
        await db
          .delete(laundryProduction.bags)
          .where(eq(laundryProduction.bags.productionOrderId, existing.id));
        if (bagCount > 0)
          await db.insert(laundryProduction.bags).values(
            Array.from({ length: bagCount }, (_, bagIndex) => ({
              id: deps.ids.next(),
              productionOrderId: existing.id,
              bagIndex,
              status: 'eligible',
            })),
          );
      }
      return stored(
        updated.id,
        updated.bagCount,
        mapProductionStatus(updated.status),
      );
    },

    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
