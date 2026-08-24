import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, eq, sql } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import { invariantViolationError } from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import type {
  ChangeAdmissionRepository,
  ChangeAdmissionTransactionRepository,
} from './execute.ts';
import type { StoredChangeAdmissionWorkEvent } from './idempotency.ts';
import type { ChangeAdmissionFacts, ChangeAdmissionResult } from './types.ts';
import {
  appendChangeAdmissionWorkEvent,
  findChangeAdmissionWorkEvent,
} from './work-event.postgres.ts';

const invariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const sourceAdmissionState = (
  value: string,
): ChangeAdmissionFacts['sourceAdmissionState'] => {
  if (value === 'unreleased' || value === 'released' || value === 'withdrawn')
    return value;
  throw invariant(
    'production_admission_source_state_invalid',
    `Unknown fulfillment admission state: ${value}.`,
  );
};

const productionStatus = (
  value: string,
): ChangeAdmissionFacts['productionStatus'] => {
  if (
    value === 'release_pending' ||
    value === 'intake_pending' ||
    value === 'eligible' ||
    value === 'ineligible' ||
    value === 'scheduled' ||
    value === 'finished'
  )
    return value;
  throw invariant(
    'production_admission_order_status_invalid',
    `Unknown production-order status: ${value}.`,
  );
};

const admissionOverride = (value: string | null): 'released' | null => {
  if (value === null || value === 'released') return value;
  throw invariant(
    'production_admission_override_invalid',
    `Unknown production admission override: ${value}.`,
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

export type ChangeAdmissionPostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makeChangeAdmissionPostgresRepository = (
  deps: ChangeAdmissionPostgresDependencies,
  schema: ProductionSchema,
): ChangeAdmissionRepository<StoredChangeAdmissionWorkEvent> => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    deps.db,
    (
      db: PostgresExecutor,
    ): ChangeAdmissionTransactionRepository<StoredChangeAdmissionWorkEvent> => ({
      findWorkEvent: (key) => findChangeAdmissionWorkEvent(db, schema, key),
      lockLocationScheduling: (locationId) =>
        lockLocationScheduling(db, locationId),
      lockOrder: async (locationId, productionOrderId) => {
        const [row] = await db
          .select({
            productionOrderId: schema.productionOrders.id,
            sourceAdmissionState: schema.orderDemands.admissionState,
            productionStatus: schema.productionOrders.operationalStatus,
            productionVersion: schema.productionOrders.version,
            executionStatus: schema.productionOrders.executionStatus,
            derivedWeightLbs: schema.productionOrders.derivedWeightLbs,
            admissionOverride: schema.productionOrders.admissionOverride,
            bagCount: schema.productionOrders.bagCount,
            resolutionState: schema.productionOrders.resolutionState,
            selectedForShift: sql<boolean>`exists (
              select 1
              from ${schema.productionShiftSelectedOrders} selected_order
              inner join ${schema.productionShifts} selected_shift
                on selected_shift.id = selected_order.production_shift_id
               and selected_shift.location_id = selected_order.location_id
              where selected_order.production_order_id = ${schema.productionOrders.id}
                and selected_order.location_id = ${locationId}
                and selected_shift.status = 'open'
            )`,
            hasActivePlacement: sql<boolean>`exists (
              select 1
              from ${schema.productionBatchOrders} active_placement
              where active_placement.production_order_id = ${schema.productionOrders.id}
                and active_placement.location_id = ${locationId}
                and active_placement.active = true
            )`,
          })
          .from(schema.productionOrders)
          .innerJoin(
            schema.orderDemands,
            and(
              eq(schema.orderDemands.id, schema.productionOrders.orderDemandId),
              eq(
                schema.orderDemands.locationId,
                schema.productionOrders.locationId,
              ),
            ),
          )
          .where(
            and(
              eq(schema.productionOrders.locationId, locationId),
              eq(schema.productionOrders.id, productionOrderId),
            ),
          )
          .limit(1)
          .for('update');
        if (row === undefined) return null;
        return {
          productionOrderId: row.productionOrderId,
          sourceAdmissionState: sourceAdmissionState(row.sourceAdmissionState),
          productionStatus: productionStatus(row.productionStatus),
          productionVersion: row.productionVersion,
          executionStatus: row.executionStatus,
          derivedWeightLbs: row.derivedWeightLbs,
          admissionOverride: admissionOverride(row.admissionOverride),
          bagCount: row.bagCount,
          selectedForShift: row.selectedForShift,
          hasActivePlacement: row.hasActivePlacement,
          resolutionState: row.resolutionState,
        };
      },
      changeAdmission: async ({
        locationId,
        productionOrderId,
        actorId,
        expectedVersion,
        admissionOverride: nextOverride,
        nextStatus,
        now,
      }) => {
        const [updated] = await db
          .update(schema.productionOrders)
          .set({
            admissionOverride: nextOverride,
            admissionOverrideAt: nextOverride === null ? null : now,
            admissionOverrideBy: nextOverride === null ? null : actorId,
            operationalStatus: nextStatus,
            eligibleAt: nextStatus === 'eligible' ? now : null,
            version: expectedVersion + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.productionOrders.locationId, locationId),
              eq(schema.productionOrders.id, productionOrderId),
              eq(schema.productionOrders.version, expectedVersion),
              eq(schema.productionOrders.resolutionState, 'open'),
            ),
          )
          .returning({
            locationId: schema.productionOrders.locationId,
            orderId: schema.productionOrders.id,
            admissionOverride: schema.productionOrders.admissionOverride,
            status: schema.productionOrders.operationalStatus,
            version: schema.productionOrders.version,
          });
        if (updated === undefined) return null;
        return {
          locationId: updated.locationId,
          orderId: updated.orderId,
          admissionOverride: admissionOverride(updated.admissionOverride),
          status: productionStatus(updated.status),
          version: updated.version,
          replayed: false,
        } satisfies ChangeAdmissionResult;
      },
      appendWorkEvent: (event) =>
        appendChangeAdmissionWorkEvent(db, schema, deps.ids, event),
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
