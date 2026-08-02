import {
  and,
  eq,
  laundryProduction,
  sql,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import { conflictError, invariantViolationError } from '@pressly/errors';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import { lockLocationScheduling } from '../persistence/scheduling-locks.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';
import type {
  ApplyFulfillmentDemandCommand,
  ApplyFulfillmentDemandRepository,
  FulfillmentAdmissionState,
  StoredFulfillmentDemand,
} from './apply-fulfillment-demand.port.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const productionConcurrencyConflict = (code: string, message: string) =>
  conflictError({
    code,
    message,
    safeMessage: 'Production state changed. Refresh and try again.',
  });

const mapAdmissionState = (value: string): FulfillmentAdmissionState => {
  switch (value) {
    case 'unreleased':
    case 'released':
    case 'withdrawn':
      return value;
    default:
      throw productionInvariantViolation(
        'production_fulfillment_demand_admission_state_invalid',
        `Unknown fulfillment admission state: ${value}.`,
      );
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
      throw productionInvariantViolation(
        'production_fulfillment_demand_commercial_state_invalid',
        `Unknown commercial order state: ${value}.`,
      );
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
      throw productionInvariantViolation(
        'production_fulfillment_demand_order_status_invalid',
        `Unknown production-order status: ${value}.`,
      );
  }
};

const asResolutionState = (
  value: string,
): 'open' | 'resolved_without_production' => {
  if (value === 'open' || value === 'resolved_without_production') return value;
  throw productionInvariantViolation(
    'production_fulfillment_demand_resolution_state_invalid',
    `Unknown production-order resolution state: ${value}.`,
  );
};

const asAdmissionOverride = (value: string | null): 'released' | null => {
  if (value === null || value === 'released') return value;
  throw productionInvariantViolation(
    'production_fulfillment_demand_admission_override_invalid',
    `Unknown production admission override: ${value}.`,
  );
};

const mapEstimatedWeightSource = (
  value: string | null,
): StoredFulfillmentDemand['estimatedWeightSource'] => {
  if (value === null || value === 'external_estimate') return value;
  throw productionInvariantViolation(
    'production_fulfillment_demand_weight_source_invalid',
    `Unknown demand weight provenance: ${value}.`,
  );
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
          throw productionInvariantViolation(
            'production_fulfillment_demand_noop_work_present',
            'A no-op demand projection found production work.',
          );
        return stored(null, null, null, null, null, null);
      }

      if (production.action === 'preserve') {
        if (existing === undefined)
          throw productionInvariantViolation(
            'production_fulfillment_demand_preserved_work_missing',
            'A preserved demand is missing production work.',
          );
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
          throw productionInvariantViolation(
            'production_fulfillment_demand_new_work_present',
            'A new demand projection found production work.',
          );
        if (
          command.estimatedWeightLbs === null ||
          command.estimatedWeightSource === null
        )
          throw productionInvariantViolation(
            'production_fulfillment_demand_estimate_missing',
            'Production work requires a positive estimate.',
          );
        if (production.status === 'eligible')
          throw productionInvariantViolation(
            'production_fulfillment_demand_physical_admission_invalid',
            'Demand projection cannot create physically admitted work.',
          );

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
          bagCount: null,
          bagCountSource: null,
          intakeRecordedAt: null,
          intakeVersion: 0,
          mustStayTogether: true,
          version: 1,
          eligibleAt: null,
          createdAt: now,
          updatedAt: now,
        });
        return stored(
          productionOrderId,
          null,
          null,
          production.status,
          initialExecutionState,
          'open',
        );
      }

      if (existing === undefined)
        throw productionInvariantViolation(
          'production_fulfillment_demand_updated_work_missing',
          'An updated demand is missing production work.',
        );

      const derivedWeightLbs =
        command.estimatedWeightLbs ?? Number(existing.derivedWeightLbs);
      const derivedWeightSource =
        command.estimatedWeightSource ??
        mapEstimatedWeightSource(existing.derivedWeightSource);
      if (derivedWeightSource === null)
        throw productionInvariantViolation(
          'production_fulfillment_demand_weight_source_missing',
          'Existing production work is missing weight provenance.',
        );
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
        throw productionConcurrencyConflict(
          'production_fulfillment_demand_order_version_conflict',
          'Production order changed during demand application.',
        );
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
