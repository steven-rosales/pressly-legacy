import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { CellOutcome } from '@pressly/cells';
import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import { loadOnlineOrderPlacementLockedContext } from '../../../postgres/online-order-placement/locked-context.postgres.ts';
import {
  persistOnlineOrderPlacement,
  persistOnlineOrderPlacementPendingOutcome,
} from '../../../postgres/online-order-placement/placement-mutation.postgres.ts';
import { placeOrderAutomaticallyConcurrencyConflict } from './failures.ts';
import type {
  CommitAutomaticPlacementInput,
  PlaceOrderAutomaticallyRepository,
  PlaceOrderAutomaticallyTransactionRepository,
} from './execute.ts';
import type { StoredPlaceOrderAutomaticallyWorkEvent } from './idempotency.ts';
import type {
  AutomaticProductionOrderPlacedResult,
  PlaceOrderAutomaticallyExpectedFailure,
} from './types.ts';
import {
  appendPlaceOrderAutomaticallyWorkEvent,
  findPlaceOrderAutomaticallyWorkEvent,
} from './work-event.postgres.ts';

const success = (
  value: AutomaticProductionOrderPlacedResult,
): CellOutcome<
  AutomaticProductionOrderPlacedResult,
  PlaceOrderAutomaticallyExpectedFailure
> => ({ kind: 'success', value });

const failure = (
  value: PlaceOrderAutomaticallyExpectedFailure,
): CellOutcome<
  AutomaticProductionOrderPlacedResult,
  PlaceOrderAutomaticallyExpectedFailure
> => ({ kind: 'failure', failure: value });

const commitPlacement = async (
  database: PostgresExecutor,
  ids: IdSource,
  input: CommitAutomaticPlacementInput,
  schema: ProductionSchema,
): Promise<
  CellOutcome<
    AutomaticProductionOrderPlacedResult,
    PlaceOrderAutomaticallyExpectedFailure
  >
> => {
  const mutation = await persistOnlineOrderPlacement(
    database,
    ids,
    {
      command: input.command,
      context: input.context,
      proposal: input.proposal,
      mode: { type: 'automatic' },
      orderLifecycle: input.orderLifecycle,
      initialBatchState: input.initialBatchState,
      initialStageState: input.initialStageState,
      initialAttemptState: input.initialAttemptState,
      overtimeAcknowledgment: null,
      now: input.now,
    },
    schema,
  );
  if (mutation.kind === 'conflict')
    return failure(
      placeOrderAutomaticallyConcurrencyConflict(
        mutation.code,
        mutation.message,
      ),
    );
  return success({
    status: 'placed',
    productionRunId: input.command.productionRunId,
    productionOrderId: input.command.productionOrderId,
    ...mutation.placement,
    mode: 'automatic',
    replayed: false,
  });
};

export type PlaceOrderAutomaticallyPostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makePlaceOrderAutomaticallyTransactionRepository = (
  deps: Readonly<{ db: PostgresExecutor; ids: IdSource }>,
  schema: ProductionSchema,
): PlaceOrderAutomaticallyTransactionRepository<StoredPlaceOrderAutomaticallyWorkEvent> =>
  Object.freeze({
    findWorkEvent: (key) =>
      findPlaceOrderAutomaticallyWorkEvent(deps.db, schema, key),
    loadContext: (locationId, productionRunId, productionOrderId) =>
      loadOnlineOrderPlacementLockedContext(
        deps.db,
        {
          locationId,
          productionRunId,
          productionOrderId,
        },
        schema,
      ),
    recordOutcome: (input) =>
      persistOnlineOrderPlacementPendingOutcome(
        deps.db,
        {
          locationId: input.command.locationId,
          productionOrderId: input.command.productionOrderId,
          pendingPlacement: input.pendingPlacement,
          now: input.now,
        },
        schema,
      ),
    commitPlacement: (input) =>
      commitPlacement(deps.db, deps.ids, input, schema),
    appendWorkEvent: (event) =>
      appendPlaceOrderAutomaticallyWorkEvent(deps.db, schema, deps.ids, event),
  });

export const makePlaceOrderAutomaticallyPostgresRepository = (
  deps: PlaceOrderAutomaticallyPostgresDependencies,
  schema: ProductionSchema,
): PlaceOrderAutomaticallyRepository<StoredPlaceOrderAutomaticallyWorkEvent> => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    deps.db,
    (database: PostgresExecutor) =>
      makePlaceOrderAutomaticallyTransactionRepository(
        {
          db: database,
          ids: deps.ids,
        },
        schema,
      ),
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
