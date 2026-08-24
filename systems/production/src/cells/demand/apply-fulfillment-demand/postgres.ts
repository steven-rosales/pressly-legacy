import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import type { ProductionScopeReconciliationV1Capability } from '@pressly/access-system/capabilities/production-scope-reconciliation-v1';
import { and, eq, sql } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import { invariantViolationError } from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import { applyFulfillmentDemandPhase } from './decide.ts';
import type {
  ApplyFulfillmentDemandRepository,
  ApplyFulfillmentDemandTransactionRepository,
} from './execute.ts';
import type { StoredApplyFulfillmentDemandWorkEvent } from './idempotency.ts';
import type {
  ApplyFulfillmentDemandCommand,
  FulfillmentAdmissionState,
  StoredFulfillmentDemand,
} from './types.ts';
import {
  appendApplyFulfillmentDemandWorkEvent,
  findApplyFulfillmentDemandWorkEvent,
} from './work-event.postgres.ts';

const invariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const admissionState = (value: string): FulfillmentAdmissionState => {
  if (value === 'unreleased' || value === 'released' || value === 'withdrawn')
    return value;
  throw invariant(
    'production_fulfillment_demand_admission_state_invalid',
    `Unknown fulfillment admission state: ${value}.`,
  );
};

const commercialState = (
  value: string,
): StoredFulfillmentDemand['commercialState'] => {
  if (value === 'open' || value === 'completed' || value === 'canceled')
    return value;
  throw invariant(
    'production_fulfillment_demand_commercial_state_invalid',
    `Unknown commercial order state: ${value}.`,
  );
};

const productionStatus = (
  value: string | null,
): StoredFulfillmentDemand['productionStatus'] => {
  if (
    value === null ||
    value === 'release_pending' ||
    value === 'intake_pending' ||
    value === 'eligible' ||
    value === 'ineligible' ||
    value === 'scheduled' ||
    value === 'finished'
  )
    return value;
  throw invariant(
    'production_fulfillment_demand_order_status_invalid',
    `Unknown production-order status: ${value}.`,
  );
};

const resolutionState = (
  value: string,
): 'open' | 'resolved_without_production' => {
  if (value === 'open' || value === 'resolved_without_production') return value;
  throw invariant(
    'production_fulfillment_demand_resolution_state_invalid',
    `Unknown production-order resolution state: ${value}.`,
  );
};

const admissionOverride = (value: string | null): 'released' | null => {
  if (value === null || value === 'released') return value;
  throw invariant(
    'production_fulfillment_demand_admission_override_invalid',
    `Unknown production admission override: ${value}.`,
  );
};

const estimatedWeightSource = (
  value: string | null,
): StoredFulfillmentDemand['estimatedWeightSource'] => {
  if (value === null || value === 'external_estimate') return value;
  throw invariant(
    'production_fulfillment_demand_weight_source_invalid',
    `Unknown demand weight provenance: ${value}.`,
  );
};

const lockLocationScheduling = async (
  db: PostgresExecutor,
  locationId: string,
): Promise<void> => {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext('production-scheduling'), hashtext(${locationId}))`,
  );
};

const lockFulfillment = async (
  db: PostgresExecutor,
  fulfillmentId: string,
): Promise<void> => {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`fulfillment-demand:${fulfillmentId}`}))`,
  );
};

const projectionFields = (command: ApplyFulfillmentDemandCommand) => ({
  displayReference: command.displayReference ?? command.fulfillmentId,
  revisionAt: new Date(command.observedAt),
  phase: applyFulfillmentDemandPhase(command.admissionState),
});

export type ApplyFulfillmentDemandPostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  productionScopeReconciliationV1: ProductionScopeReconciliationV1Capability;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makeApplyFulfillmentDemandPostgresRepository = (
  deps: ApplyFulfillmentDemandPostgresDependencies,
  schema: ProductionSchema,
): ApplyFulfillmentDemandRepository<StoredApplyFulfillmentDemandWorkEvent> => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    deps.db,
    (
      db: PostgresExecutor,
    ): ApplyFulfillmentDemandTransactionRepository<StoredApplyFulfillmentDemandWorkEvent> => ({
      findWorkEvent: (key) =>
        findApplyFulfillmentDemandWorkEvent(db, schema, key),
      locationIsActive: async (locationId) => {
        const location = await deps.productionScopeReconciliationV1.load({
          locationId,
        });
        return location?.isActive === true;
      },
      lockLocationScheduling: (locationId) =>
        lockLocationScheduling(db, locationId),
      lockFulfillment: (fulfillmentId) => lockFulfillment(db, fulfillmentId),
      loadDemand: async (fulfillmentId) => {
        const [demand] = await db
          .select()
          .from(schema.orderDemands)
          .where(eq(schema.orderDemands.fulfillmentId, fulfillmentId))
          .limit(1);
        if (demand === undefined) return null;
        const [order] = await db
          .select({
            id: schema.productionOrders.id,
            bagCount: schema.productionOrders.bagCount,
            status: schema.productionOrders.operationalStatus,
            executionStatus: schema.productionOrders.executionStatus,
            resolutionState: schema.productionOrders.resolutionState,
            admissionOverride: schema.productionOrders.admissionOverride,
          })
          .from(schema.productionOrders)
          .where(eq(schema.productionOrders.orderDemandId, demand.id))
          .limit(1)
          .for('update');
        return {
          orderDemandId: demand.id,
          productionOrderId: order?.id ?? null,
          fulfillmentId: demand.fulfillmentId,
          fulfillmentVersion: demand.fulfillmentVersion,
          projectionHash: demand.projectionHash,
          locationId: demand.locationId,
          admissionState: admissionState(demand.admissionState),
          commercialState: commercialState(demand.commercialState),
          dueAt: demand.dueAt.toISOString(),
          estimatedWeightLbs: demand.estimatedWeightLbs,
          estimatedWeightSource: estimatedWeightSource(
            demand.estimatedWeightSource,
          ),
          bagCount: order?.bagCount ?? null,
          admissionOverride: admissionOverride(
            order?.admissionOverride ?? null,
          ),
          productionStatus: productionStatus(order?.status ?? null),
          productionExecutionStatus: order?.executionStatus ?? null,
          productionResolutionState:
            order === undefined ? null : resolutionState(order.resolutionState),
        };
      },
      applyDemand: async ({
        command,
        orderDemandId,
        production: productionMutation,
        initialExecutionState,
        now,
      }) => {
        const [storedDemand] = await db
          .select({ id: schema.orderDemands.id })
          .from(schema.orderDemands)
          .where(eq(schema.orderDemands.fulfillmentId, command.fulfillmentId))
          .limit(1);
        const dueAt = new Date(command.dueAt);
        const projection = projectionFields(command);

        if (storedDemand === undefined)
          await db.insert(schema.orderDemands).values({
            id: orderDemandId,
            fulfillmentId: command.fulfillmentId,
            fulfillmentVersion: command.fulfillmentVersion,
            projectionHash: command.projectionHash,
            admissionState: command.admissionState,
            commercialState: command.commercialState,
            ...projection,
            locationId: command.locationId,
            estimatedWeightLbs: command.estimatedWeightLbs,
            estimatedWeightSource: command.estimatedWeightSource,
            dueAt,
            createdAt: now,
            updatedAt: now,
          });
        else
          await db
            .update(schema.orderDemands)
            .set({
              fulfillmentVersion: command.fulfillmentVersion,
              projectionHash: command.projectionHash,
              admissionState: command.admissionState,
              commercialState: command.commercialState,
              ...projection,
              estimatedWeightLbs: command.estimatedWeightLbs,
              estimatedWeightSource: command.estimatedWeightSource,
              dueAt,
              updatedAt: now,
            })
            .where(eq(schema.orderDemands.id, orderDemandId));

        const [existing] = await db
          .select()
          .from(schema.productionOrders)
          .where(eq(schema.productionOrders.orderDemandId, orderDemandId))
          .limit(1)
          .for('update');

        const stored = (
          productionOrderId: string | null,
          bagCount: number | null,
          currentAdmissionOverride: 'released' | null,
          currentProductionStatus: StoredFulfillmentDemand['productionStatus'],
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
          admissionOverride: currentAdmissionOverride,
          productionStatus: currentProductionStatus,
          productionExecutionStatus,
          productionResolutionState,
        });

        if (productionMutation.action === 'none') {
          if (existing !== undefined)
            throw invariant(
              'production_fulfillment_demand_noop_work_present',
              'A no-op demand projection found production work.',
            );
          return {
            kind: 'stored',
            demand: stored(null, null, null, null, null, null),
          };
        }

        if (productionMutation.action === 'preserve') {
          if (existing === undefined)
            throw invariant(
              'production_fulfillment_demand_preserved_work_missing',
              'A preserved demand is missing production work.',
            );
          return {
            kind: 'stored',
            demand: stored(
              existing.id,
              existing.bagCount,
              admissionOverride(existing.admissionOverride),
              productionStatus(existing.operationalStatus),
              existing.executionStatus,
              resolutionState(existing.resolutionState),
            ),
          };
        }

        if (productionMutation.action === 'create') {
          if (existing !== undefined)
            throw invariant(
              'production_fulfillment_demand_new_work_present',
              'A new demand projection found production work.',
            );
          if (
            command.estimatedWeightLbs === null ||
            command.estimatedWeightSource === null
          )
            throw invariant(
              'production_fulfillment_demand_estimate_missing',
              'Production work requires a positive estimate.',
            );
          if (productionMutation.status === 'eligible')
            throw invariant(
              'production_fulfillment_demand_physical_admission_invalid',
              'Demand projection cannot create physically admitted work.',
            );

          const productionOrderId = deps.ids.next();
          await db.insert(schema.productionOrders).values({
            id: productionOrderId,
            orderDemandId,
            locationId: command.locationId,
            dueAt,
            priority: false,
            operationalStatus: productionMutation.status,
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
          return {
            kind: 'stored',
            demand: stored(
              productionOrderId,
              null,
              null,
              productionMutation.status,
              initialExecutionState,
              'open',
            ),
          };
        }

        if (existing === undefined)
          throw invariant(
            'production_fulfillment_demand_updated_work_missing',
            'An updated demand is missing production work.',
          );

        const derivedWeightLbs =
          command.estimatedWeightLbs ?? Number(existing.derivedWeightLbs);
        const derivedWeightSource =
          command.estimatedWeightSource ??
          estimatedWeightSource(existing.derivedWeightSource);
        if (derivedWeightSource === null)
          throw invariant(
            'production_fulfillment_demand_weight_source_missing',
            'Existing production work is missing weight provenance.',
          );
        const [updated] = await db
          .update(schema.productionOrders)
          .set({
            dueAt,
            operationalStatus: productionMutation.status,
            derivedWeightLbs,
            derivedWeightSource,
            eligibleAt:
              productionMutation.status === 'eligible'
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
              eq(schema.productionOrders.id, existing.id),
              eq(schema.productionOrders.version, existing.version),
              eq(schema.productionOrders.resolutionState, 'open'),
            ),
          )
          .returning({
            id: schema.productionOrders.id,
            bagCount: schema.productionOrders.bagCount,
            status: schema.productionOrders.operationalStatus,
            admissionOverride: schema.productionOrders.admissionOverride,
            executionStatus: schema.productionOrders.executionStatus,
            resolutionState: schema.productionOrders.resolutionState,
          });
        if (updated === undefined) return { kind: 'version_conflict' };
        return {
          kind: 'stored',
          demand: stored(
            updated.id,
            updated.bagCount,
            admissionOverride(updated.admissionOverride),
            productionStatus(updated.status),
            updated.executionStatus,
            resolutionState(updated.resolutionState),
          ),
        };
      },
      appendWorkEvent: (event) =>
        appendApplyFulfillmentDemandWorkEvent(db, schema, deps.ids, event),
    }),
  );
  const unitOfWork =
    deps.observeUnitOfWork?.(nativeUnitOfWork) ?? nativeUnitOfWork;

  return Object.freeze({
    transaction: async (work) => {
      const outcome = await unitOfWork.transaction(async (repository) => {
        const cellOutcome = await work(repository);
        return cellOutcome.kind === 'success'
          ? result.ok(cellOutcome.value)
          : result.err(cellOutcome.failure);
      });
      return outcome.tag === 'ok'
        ? { kind: 'success', value: outcome.value }
        : { kind: 'failure', failure: outcome.error };
    },
  });
};
