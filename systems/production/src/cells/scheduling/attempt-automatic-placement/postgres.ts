import { canonicalJson, isJsonObject, type JsonObject } from '@pressly/codec';
import type { CellOutcome } from '@pressly/cells';
import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import { and, asc, eq, sql } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import {
  appendOnlineOrderPlacementWorkEvent,
  findOnlineOrderPlacementWorkEventPayload,
} from '../../../postgres/online-order-placement/work-event.postgres.ts';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import type {
  AttemptAutomaticPlacementRepository,
  AttemptAutomaticPlacementTransactionRepository,
} from './execute.ts';
import type {
  AttemptAutomaticPlacementExpectedFailure,
  AttemptAutomaticPlacementResult,
  AutomaticPlacementDelegationCommand,
  PendingRunResolution,
} from './types.ts';

export type ExecuteAutomaticPlacementWithDatabase = (
  input: Readonly<{
    database: PostgresExecutor;
    command: AutomaticPlacementDelegationCommand;
  }>,
) => Promise<
  CellOutcome<
    Exclude<AttemptAutomaticPlacementResult, null>,
    AttemptAutomaticPlacementExpectedFailure
  >
>;

const lockLocationScheduling = async (
  database: PostgresExecutor,
  locationId: string,
): Promise<void> => {
  await database.execute(
    sql`select pg_advisory_xact_lock(hashtext('production-scheduling'), hashtext(${locationId}))`,
  );
};

const serializedPlacement = (placement: PendingRunResolution): JsonObject =>
  placement.status === 'awaiting_run'
    ? {
        status: placement.status,
        reason: placement.reason,
        message: placement.message,
      }
    : {
        status: placement.status,
        reason: placement.reason,
        message: placement.message,
        candidateProductionRunIds: [...placement.candidateProductionRunIds],
      };

const recordPendingRunResolution = async (
  database: PostgresExecutor,
  ids: IdSource,
  input: Readonly<{
    locationId: string;
    productionOrderId: string;
    actorId: string;
    idempotencyKey: string;
    placement: PendingRunResolution;
    now: Date;
  }>,
  schema: ProductionSchema,
): Promise<'recorded' | 'replayed' | 'conflict'> => {
  const placement = serializedPlacement(input.placement);
  const command: JsonObject = {
    operation: 'production_order_automatic_placement_pending',
    locationId: input.locationId,
    actorId: input.actorId,
    target: {
      entityType: 'production_order',
      entityId: input.productionOrderId,
    },
    expectedVersion: null,
    payload: { placement },
  };
  const storedPayload = await findOnlineOrderPlacementWorkEventPayload(
    database,
    schema,
    input.idempotencyKey,
  );
  if (storedPayload !== null) {
    const envelope = storedPayload['_idempotency'];
    const storedCommand = isJsonObject(envelope)
      ? envelope['command']
      : undefined;
    return isJsonObject(storedCommand) &&
      canonicalJson(storedCommand) === canonicalJson(command)
      ? 'replayed'
      : 'conflict';
  }

  await database
    .update(schema.productionOrders)
    .set({ pendingPlacement: placement, updatedAt: input.now })
    .where(
      and(
        eq(schema.productionOrders.locationId, input.locationId),
        eq(schema.productionOrders.id, input.productionOrderId),
        eq(schema.productionOrders.operationalStatus, 'eligible'),
        eq(schema.productionOrders.resolutionState, 'open'),
      ),
    );
  await appendOnlineOrderPlacementWorkEvent(database, schema, ids, {
    locationId: input.locationId,
    eventType: 'production_order_placement_pending',
    entityType: 'production_order',
    entityId: input.productionOrderId,
    actorId: input.actorId,
    expectedVersion: null,
    idempotencyKey: input.idempotencyKey,
    payload: {
      placement,
      _idempotency: {
        version: 1,
        command,
        result: placement,
      },
    },
  });
  return 'recorded';
};

export type AttemptAutomaticPlacementPostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  placeAutomatically: ExecuteAutomaticPlacementWithDatabase;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makeAttemptAutomaticPlacementPostgresRepository = (
  deps: AttemptAutomaticPlacementPostgresDependencies,
  schema: ProductionSchema,
): AttemptAutomaticPlacementRepository => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    deps.db,
    (
      database: PostgresExecutor,
    ): AttemptAutomaticPlacementTransactionRepository => ({
      lockLocationScheduling: (locationId) =>
        lockLocationScheduling(database, locationId),
      findStartedRuns: (locationId) =>
        database
          .select({
            productionRunId: schema.productionRuns.id,
            queueVersion: schema.productionRuns.queueVersion,
          })
          .from(schema.productionRuns)
          .where(
            and(
              eq(schema.productionRuns.locationId, locationId),
              eq(schema.productionRuns.status, 'started'),
            ),
          )
          .orderBy(asc(schema.productionRuns.id)),
      recordPendingRunResolution: (input) =>
        recordPendingRunResolution(database, deps.ids, input, schema),
      placeAutomatically: (command) =>
        deps.placeAutomatically({ database, command }),
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
