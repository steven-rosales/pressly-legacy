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
  ChangeOrderResolutionRepository,
  ChangeOrderResolutionTransactionRepository,
} from './execute.ts';
import type { StoredChangeOrderResolutionWorkEvent } from './idempotency.ts';
import type {
  ChangeOrderResolutionFacts,
  ChangeOrderResolutionResult,
} from './types.ts';
import {
  appendChangeOrderResolutionWorkEvent,
  findChangeOrderResolutionWorkEvent,
} from './work-event.postgres.ts';

const invariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const operationalStatus = (
  value: string,
): ChangeOrderResolutionFacts['operationalStatus'] => {
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
    'production_order_resolution_status_invalid',
    `Unknown production-order status: ${value}.`,
  );
};

const admissionState = (
  value: string,
): ChangeOrderResolutionFacts['sourceAdmissionState'] => {
  if (value === 'unreleased' || value === 'released' || value === 'withdrawn')
    return value;
  throw invariant(
    'production_order_resolution_admission_state_invalid',
    `Unknown fulfillment admission state: ${value}.`,
  );
};

const commercialState = (
  value: string,
): ChangeOrderResolutionFacts['sourceCommercialState'] => {
  if (value === 'open' || value === 'completed' || value === 'canceled')
    return value;
  throw invariant(
    'production_order_resolution_commercial_state_invalid',
    `Unknown commercial order state: ${value}.`,
  );
};

const demandPhase = (
  value: string,
): ChangeOrderResolutionFacts['demandPhase'] => {
  if (
    value === 'expected' ||
    value === 'inbound' ||
    value === 'production_released' ||
    value === 'post_production' ||
    value === 'withdrawn'
  )
    return value;
  throw invariant(
    'production_order_resolution_demand_phase_invalid',
    `Unknown demand phase: ${value}.`,
  );
};

const admissionOverride = (value: string | null): 'released' | null => {
  if (value === null || value === 'released') return value;
  throw invariant(
    'production_order_resolution_admission_override_invalid',
    `Unknown production admission override: ${value}.`,
  );
};

const resolutionState = (
  value: string,
): ChangeOrderResolutionResult['resolutionState'] => {
  if (value === 'open' || value === 'resolved_without_production') return value;
  throw invariant(
    'production_order_resolution_state_invalid',
    `Unknown production-order resolution state: ${value}.`,
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

export type ChangeOrderResolutionPostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makeChangeOrderResolutionPostgresRepository = (
  deps: ChangeOrderResolutionPostgresDependencies,
  schema: ProductionSchema,
): ChangeOrderResolutionRepository<StoredChangeOrderResolutionWorkEvent> => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    deps.db,
    (
      db: PostgresExecutor,
    ): ChangeOrderResolutionTransactionRepository<StoredChangeOrderResolutionWorkEvent> => ({
      findWorkEvent: (key) =>
        findChangeOrderResolutionWorkEvent(db, schema, key),
      lockLocationScheduling: (locationId) =>
        lockLocationScheduling(db, locationId),
      lockOrder: async (locationId, productionOrderId) => {
        const [row] = await db
          .select({
            order: schema.productionOrders,
            sourceAdmissionState: schema.orderDemands.admissionState,
            sourceCommercialState: schema.orderDemands.commercialState,
            demandPhase: schema.orderDemands.phase,
            sourceDueAt: schema.orderDemands.dueAt,
            sourceEstimatedWeightLbs: schema.orderDemands.estimatedWeightLbs,
            sourceEstimatedWeightSource:
              schema.orderDemands.estimatedWeightSource,
            hasShiftSelection: sql<boolean>`exists (
              select 1
              from ${schema.productionShiftSelectedOrders} selected_order
              where selected_order.production_order_id = ${schema.productionOrders.id}
                and selected_order.location_id = ${locationId}
            )`,
            hasHistoricalPlanSelection: sql<boolean>`(
              exists (
                select 1
                from ${schema.scheduleRuns} schedule_history
                where schedule_history.location_id = ${locationId}
                  and schedule_history.input_snapshot @> jsonb_build_object(
                    'orders',
                    jsonb_build_array(
                      jsonb_build_object('id', ${schema.productionOrders.id})
                    )
                  )
              )
              or exists (
                select 1
                from ${schema.workEvents} selection_event
                where selection_event.location_id = ${locationId}
                  and selection_event.entity_type = 'production_shift'
                  and selection_event.event_type = 'production_shift_selection_replaced'
                  and selection_event.payload_json @> jsonb_build_object(
                    'selectedOrderIds',
                    jsonb_build_array(${schema.productionOrders.id})
                  )
              )
            )`,
            hasBatchMembership: sql<boolean>`exists (
              select 1
              from ${schema.productionBatchOrders} membership_history
              where membership_history.production_order_id = ${schema.productionOrders.id}
                and membership_history.location_id = ${locationId}
            )`,
            hasStageAttempt: sql<boolean>`exists (
              select 1
              from ${schema.productionOrderStageAttempts} attempt_history
              where attempt_history.production_order_id = ${schema.productionOrders.id}
                and attempt_history.location_id = ${locationId}
            )`,
            hasRoute: sql<boolean>`exists (
              select 1
              from ${schema.workEvents} route_event
              where route_event.entity_type = 'production_order'
                and route_event.entity_id = ${schema.productionOrders.id}
                and route_event.location_id = ${locationId}
                and route_event.event_type in (
                  'production_order_rebatched',
                  'production_order_route_exception_recorded'
                )
            )`,
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
          productionOrderId: row.order.id,
          productionVersion: row.order.version,
          resolutionState: row.order.resolutionState,
          executionStatus: row.order.executionStatus,
          operationalStatus: operationalStatus(row.order.operationalStatus),
          sourceAdmissionState: admissionState(row.sourceAdmissionState),
          sourceCommercialState: commercialState(row.sourceCommercialState),
          demandPhase: demandPhase(row.demandPhase),
          sourceDueAt: row.sourceDueAt,
          sourceEstimatedWeightLbs: row.sourceEstimatedWeightLbs,
          sourceEstimatedWeightSource: row.sourceEstimatedWeightSource,
          admissionOverride: admissionOverride(row.order.admissionOverride),
          bagCount: row.order.bagCount,
          hasIntake:
            row.order.intakeVersion > 0 ||
            row.order.intakeRecordedAt !== null ||
            row.order.bagCount !== null,
          hasManualAdmission: row.order.admissionOverride !== null,
          isPriority: row.order.priority,
          hasPendingPlacement: row.order.pendingPlacement !== null,
          hasShiftSelection: row.hasShiftSelection,
          hasHistoricalPlanSelection: row.hasHistoricalPlanSelection,
          hasBatchMembership: row.hasBatchMembership,
          hasStageAttempt: row.hasStageAttempt,
          hasRoute: row.hasRoute,
        };
      },
      changeResolution: async ({
        locationId,
        productionOrderId,
        actorId,
        expectedVersion,
        lifecycle,
        reason,
        note,
        clearPendingPlacement,
        restoredSourceProjection,
        now,
      }) => {
        const resolving = lifecycle.state === 'resolved_without_production';
        const [updated] = await db
          .update(schema.productionOrders)
          .set({
            resolutionState: lifecycle.state,
            resolvedAt: resolving ? now : null,
            resolvedBy: resolving ? actorId : null,
            resolutionReason: resolving ? reason : null,
            resolutionNote: resolving ? note : null,
            resolutionBulkOperationId: null,
            ...(clearPendingPlacement ? { pendingPlacement: null } : {}),
            ...(restoredSourceProjection === null
              ? {}
              : {
                  dueAt: restoredSourceProjection.dueAt,
                  derivedWeightLbs: restoredSourceProjection.derivedWeightLbs,
                  derivedWeightSource:
                    restoredSourceProjection.derivedWeightSource,
                  operationalStatus: restoredSourceProjection.operationalStatus,
                  eligibleAt:
                    restoredSourceProjection.operationalStatus === 'eligible'
                      ? now
                      : null,
                  ...(restoredSourceProjection.clearAdmissionOverride
                    ? {
                        admissionOverride: null,
                        admissionOverrideAt: null,
                        admissionOverrideBy: null,
                      }
                    : {}),
                }),
            version: expectedVersion + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.productionOrders.locationId, locationId),
              eq(schema.productionOrders.id, productionOrderId),
              eq(schema.productionOrders.version, expectedVersion),
              eq(schema.productionOrders.resolutionState, lifecycle.from),
            ),
          )
          .returning({
            locationId: schema.productionOrders.locationId,
            orderId: schema.productionOrders.id,
            resolutionState: schema.productionOrders.resolutionState,
            version: schema.productionOrders.version,
          });
        if (updated === undefined) return null;
        return {
          locationId: updated.locationId,
          orderId: updated.orderId,
          action: resolving ? 'resolve_without_production' : 'restore',
          resolutionState: resolutionState(updated.resolutionState),
          transitionedAt: now.toISOString(),
          version: updated.version,
          replayed: false,
        } satisfies ChangeOrderResolutionResult;
      },
      appendWorkEvent: (event) =>
        appendChangeOrderResolutionWorkEvent(db, schema, deps.ids, event),
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
