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
  RecordOrderIntakeRepository,
  RecordOrderIntakeTransactionRepository,
} from './execute.ts';
import type { StoredRecordOrderIntakeWorkEvent } from './idempotency.ts';
import type { RecordOrderIntakeFacts } from './types.ts';
import {
  appendRecordOrderIntakeWorkEvent,
  findRecordOrderIntakeWorkEvent,
} from './work-event.postgres.ts';

const invariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const demandPhase = (value: string): RecordOrderIntakeFacts['demandPhase'] => {
  if (
    value === 'expected' ||
    value === 'inbound' ||
    value === 'production_released' ||
    value === 'post_production' ||
    value === 'withdrawn'
  )
    return value;
  throw invariant(
    'production_order_intake_demand_phase_invalid',
    `Unknown order-demand phase: ${value}.`,
  );
};

const admissionOverride = (value: string | null): 'released' | null => {
  if (value === null || value === 'released') return value;
  throw invariant(
    'production_order_intake_admission_override_invalid',
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

export type RecordOrderIntakePostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makeRecordOrderIntakePostgresRepository = (
  deps: RecordOrderIntakePostgresDependencies,
  schema: ProductionSchema,
): RecordOrderIntakeRepository<StoredRecordOrderIntakeWorkEvent> => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    deps.db,
    (
      db: PostgresExecutor,
    ): RecordOrderIntakeTransactionRepository<StoredRecordOrderIntakeWorkEvent> => ({
      findWorkEvent: (key) => findRecordOrderIntakeWorkEvent(db, schema, key),
      lockLocationScheduling: (locationId) =>
        lockLocationScheduling(db, locationId),
      lockOrder: async (locationId, productionOrderId) => {
        const [row] = await db
          .select({
            productionOrderId: schema.productionOrders.id,
            productionStatus: schema.productionOrders.operationalStatus,
            productionVersion: schema.productionOrders.version,
            intakeVersion: schema.productionOrders.intakeVersion,
            derivedWeightLbs: schema.productionOrders.derivedWeightLbs,
            demandPhase: schema.orderDemands.phase,
            admissionOverride: schema.productionOrders.admissionOverride,
            executionStatus: schema.productionOrders.executionStatus,
            resolutionState: schema.productionOrders.resolutionState,
          })
          .from(schema.productionOrders)
          .innerJoin(
            schema.orderDemands,
            and(
              eq(schema.productionOrders.orderDemandId, schema.orderDemands.id),
              eq(
                schema.productionOrders.locationId,
                schema.orderDemands.locationId,
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
          productionStatus: row.productionStatus,
          productionVersion: row.productionVersion,
          intakeVersion: row.intakeVersion,
          derivedWeightLbs: row.derivedWeightLbs,
          demandPhase: demandPhase(row.demandPhase),
          admissionOverride: admissionOverride(row.admissionOverride),
          executionStatus: row.executionStatus,
          resolutionState: row.resolutionState,
        };
      },
      recordIntake: async ({
        locationId,
        productionOrderId,
        bagCount,
        expectedVersion,
        currentIntakeVersion,
        nextStatus,
        now,
      }) => {
        const [updated] = await db
          .update(schema.productionOrders)
          .set({
            bagCount,
            bagCountSource: 'operator_intake',
            intakeRecordedAt: now,
            intakeVersion: currentIntakeVersion + 1,
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
            bagCount: schema.productionOrders.bagCount,
            intakeVersion: schema.productionOrders.intakeVersion,
            version: schema.productionOrders.version,
          });
        if (updated === undefined || updated.bagCount === null) return null;

        await db
          .delete(schema.bags)
          .where(eq(schema.bags.productionOrderId, productionOrderId));
        if (bagCount > 0)
          await db.insert(schema.bags).values(
            Array.from({ length: bagCount }, (_, bagIndex) => ({
              id: deps.ids.next(),
              productionOrderId,
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
      appendWorkEvent: (event) =>
        appendRecordOrderIntakeWorkEvent(db, schema, deps.ids, event),
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
