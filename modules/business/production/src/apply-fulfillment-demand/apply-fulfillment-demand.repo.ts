import {
  and,
  eq,
  laundryProduction,
  sql,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import { lockLocationScheduling } from '../persistence/scheduling-locks.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';
import type {
  ApplyFulfillmentDemandCommand,
  ApplyFulfillmentDemandRepository,
  FulfillmentAdmissionState,
  StoredFulfillmentDemand,
} from './apply-fulfillment-demand.port.ts';

const mapAdmissionState = (value: string): FulfillmentAdmissionState => {
  switch (value) {
    case 'unreleased':
    case 'released':
    case 'withdrawn':
      return value;
    default:
      throw new Error(`Unknown fulfillment admission state: ${value}.`);
  }
};

const mapCommercialState = (
  value: string,
): StoredFulfillmentDemand['commercialState'] => {
  switch (value) {
    case 'open':
    case 'completed':
    case 'canceled':
      return value;
    default:
      throw new Error(`Unknown commercial order state: ${value}.`);
  }
};

const mapProductionStatus = (
  value: string | null,
): StoredFulfillmentDemand['productionStatus'] => {
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

const asResolutionState = (
  value: string,
): 'open' | 'resolved_without_production' => {
  if (value === 'open' || value === 'resolved_without_production') return value;
  throw new Error(`Unknown production-order resolution state: ${value}.`);
};

const asAdmissionOverride = (value: string | null): 'released' | null => {
  if (value === null || value === 'released') return value;
  throw new Error(`Unknown production admission override: ${value}.`);
};

const mapEstimatedWeightSource = (
  value: string | null,
): StoredFulfillmentDemand['estimatedWeightSource'] => {
  if (value === null || value === 'external_estimate') return value;
  throw new Error(`Unknown demand weight provenance: ${value}.`);
};

const phaseFor = (
  admissionState: FulfillmentAdmissionState,
): 'expected' | 'production_released' | 'withdrawn' =>
  admissionState === 'released'
    ? 'production_released'
    : admissionState === 'withdrawn'
      ? 'withdrawn'
      : 'expected';

const compatibilityFields = (command: ApplyFulfillmentDemandCommand) => ({
  demandKey: `fulfillment:${command.fulfillmentId}`,
  displayReference: command.displayReference ?? command.fulfillmentId,
  revisionHash: command.projectionHash,
  revisionAt: new Date(command.observedAt),
  phase: phaseFor(command.admissionState),
  sourceStatusCode: `canonical:${command.commercialState}`,
});

export const makeApplyFulfillmentDemandRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): ApplyFulfillmentDemandRepository =>
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

    lockFulfillment: async (fulfillmentId) => {
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`fulfillment-demand:${fulfillmentId}`}))`,
      );
    },

    loadDemand: async (fulfillmentId) => {
      const [demand] = await db
        .select()
        .from(laundryProduction.orderDemands)
        .where(eq(laundryProduction.orderDemands.fulfillmentId, fulfillmentId))
        .limit(1);
      if (demand === undefined) return null;
      const [productionOrder] = await db
        .select({
          id: laundryProduction.productionOrders.id,
          bagCount: laundryProduction.productionOrders.bagCount,
          status: laundryProduction.productionOrders.operationalStatus,
          executionStatus: laundryProduction.productionOrders.executionStatus,
          resolutionState: laundryProduction.productionOrders.resolutionState,
          admissionOverride:
            laundryProduction.productionOrders.admissionOverride,
        })
        .from(laundryProduction.productionOrders)
        .where(eq(laundryProduction.productionOrders.orderDemandId, demand.id))
        .limit(1)
        .for('update');
      return {
        orderDemandId: demand.id,
        productionOrderId: productionOrder?.id ?? null,
        fulfillmentId: demand.fulfillmentId,
        fulfillmentVersion: demand.fulfillmentVersion,
        projectionHash: demand.projectionHash,
        locationId: demand.locationId,
        admissionState: mapAdmissionState(demand.admissionState),
        commercialState: mapCommercialState(demand.commercialState),
        dueAt: demand.dueAt.toISOString(),
        estimatedWeightLbs: demand.estimatedWeightLbs,
        estimatedWeightSource: mapEstimatedWeightSource(
          demand.estimatedWeightSource,
        ),
        bagCount: productionOrder?.bagCount ?? null,
        admissionOverride: asAdmissionOverride(
          productionOrder?.admissionOverride ?? null,
        ),
        productionStatus: mapProductionStatus(productionOrder?.status ?? null),
        productionExecutionStatus: productionOrder?.executionStatus ?? null,
        productionResolutionState:
          productionOrder === undefined
            ? null
            : asResolutionState(productionOrder.resolutionState),
      };
    },

    applyDemand: async ({
      command,
      orderDemandId,
      production,
      effectiveBagCount,
      initialExecutionState,
      now,
    }) => {
      const [storedDemand] = await db
        .select({ id: laundryProduction.orderDemands.id })
        .from(laundryProduction.orderDemands)
        .where(
          eq(
            laundryProduction.orderDemands.fulfillmentId,
            command.fulfillmentId,
          ),
        )
        .limit(1);
      const dueAt = new Date(command.dueAt);
      const compatibility = compatibilityFields(command);

      if (storedDemand === undefined)
        await db.insert(laundryProduction.orderDemands).values({
          id: orderDemandId,
          fulfillmentId: command.fulfillmentId,
          fulfillmentVersion: command.fulfillmentVersion,
          projectionHash: command.projectionHash,
          admissionState: command.admissionState,
          commercialState: command.commercialState,
          ...compatibility,
          locationId: command.locationId,
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
            fulfillmentVersion: command.fulfillmentVersion,
            projectionHash: command.projectionHash,
            admissionState: command.admissionState,
            commercialState: command.commercialState,
            ...compatibility,
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
        admissionOverride: 'released' | null,
        productionStatus: StoredFulfillmentDemand['productionStatus'],
        productionExecutionStatus: string | null,
        productionResolutionState:
          | 'open'
          | 'resolved_without_production'
          | null,
      ): StoredFulfillmentDemand => ({
        orderDemandId,
        productionOrderId,
        fulfillmentId: command.fulfillmentId,
        fulfillmentVersion: command.fulfillmentVersion,
        projectionHash: command.projectionHash,
        locationId: command.locationId,
        admissionState: command.admissionState,
        commercialState: command.commercialState,
        dueAt: command.dueAt,
        estimatedWeightLbs: command.estimatedWeightLbs,
        estimatedWeightSource: command.estimatedWeightSource,
        bagCount,
        admissionOverride,
        productionStatus,
        productionExecutionStatus,
        productionResolutionState,
      });

      if (production.action === 'none') {
        if (existing !== undefined)
          throw new Error('A no-op demand projection found production work.');
        return stored(null, null, null, null, null, null);
      }

      if (production.action === 'preserve') {
        if (existing === undefined)
          throw new Error('A preserved demand is missing production work.');
        return stored(
          existing.id,
          existing.bagCount,
          asAdmissionOverride(existing.admissionOverride),
          mapProductionStatus(existing.operationalStatus),
          existing.executionStatus,
          asResolutionState(existing.resolutionState),
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
          operationalStatus: production.status,
          executionStatus: initialExecutionState,
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
        return stored(
          productionOrderId,
          effectiveBagCount,
          null,
          production.status,
          initialExecutionState,
          'open',
        );
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
          operationalStatus: production.status,
          derivedWeightLbs,
          derivedWeightSource,
          eligibleAt:
            production.status === 'eligible'
              ? (existing.eligibleAt ?? now)
              : null,
          ...(command.admissionState === 'unreleased'
            ? {}
            : {
                admissionOverride: null,
                admissionOverrideAt: null,
                admissionOverrideBy: null,
              }),
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
            eq(laundryProduction.productionOrders.resolutionState, 'open'),
          ),
        )
        .returning({
          id: laundryProduction.productionOrders.id,
          bagCount: laundryProduction.productionOrders.bagCount,
          status: laundryProduction.productionOrders.operationalStatus,
          admissionOverride:
            laundryProduction.productionOrders.admissionOverride,
          executionStatus: laundryProduction.productionOrders.executionStatus,
          resolutionState: laundryProduction.productionOrders.resolutionState,
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
        asAdmissionOverride(updated.admissionOverride),
        mapProductionStatus(updated.status),
        updated.executionStatus,
        asResolutionState(updated.resolutionState),
      );
    },

    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
