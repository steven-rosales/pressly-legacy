import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import {
  persistOnlineOrderPlacement,
  persistOnlineOrderPlacementPendingOutcome,
} from '../../../postgres/online-order-placement/placement-mutation.postgres.ts';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import { loadPlaceOrderExactlyContext } from './context.postgres.ts';
import type {
  PlaceOrderExactlyRepository,
  PlaceOrderExactlyTransactionRepository,
} from './execute.ts';
import { placeOrderExactlyConcurrencyConflict } from './failures.ts';
import type { StoredPlaceOrderExactlyWorkEvent } from './idempotency.ts';
import type {
  ExactOrderPlacedResult,
  PlaceOrderExactlyMutation,
  PlaceOrderExactlyMutationInput,
} from './types.ts';
import {
  appendPlaceOrderExactlyWorkEvent,
  findPlaceOrderExactlyWorkEvent,
} from './work-event.postgres.ts';

const commitPlacement = async (
  database: PostgresExecutor,
  ids: IdSource,
  input: PlaceOrderExactlyMutationInput,
  schema: ProductionSchema,
): Promise<PlaceOrderExactlyMutation> => {
  const mutation = await persistOnlineOrderPlacement(
    database,
    ids,
    {
      command: input.command,
      context: input.context,
      proposal: input.plan.proposal,
      mode: {
        type: 'manager_exact',
        targetBatchId: input.command.productionBatchId,
      },
      orderLifecycle: input.plan.orderLifecycle,
      initialBatchState: input.plan.initialBatchState,
      initialStageState: input.plan.initialStageState,
      initialAttemptState: input.plan.initialAttemptState,
      overtimeAcknowledgment: null,
      now: input.now,
    },
    schema,
  );
  if (mutation.kind === 'conflict')
    return {
      kind: 'conflict',
      failure: placeOrderExactlyConcurrencyConflict(
        mutation.code,
        mutation.message,
      ),
    };
  const placed: ExactOrderPlacedResult = {
    status: 'placed',
    mode: 'manager_exact',
    productionRunId: input.command.productionRunId,
    productionOrderId: input.command.productionOrderId,
    ...mutation.placement,
    replayed: false,
  };
  return { kind: 'saved', result: placed };
};

export type PlaceOrderExactlyPostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makePlaceOrderExactlyPostgresRepository = (
  dependencies: PlaceOrderExactlyPostgresDependencies,
  schema: ProductionSchema,
): PlaceOrderExactlyRepository<StoredPlaceOrderExactlyWorkEvent> => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    dependencies.db,
    (database: PostgresExecutor) =>
      ({
        findWorkEvent: (key) =>
          findPlaceOrderExactlyWorkEvent(database, schema, key),
        loadContext: (input) =>
          loadPlaceOrderExactlyContext(database, input, schema),
        savePendingOutcome: (input) =>
          persistOnlineOrderPlacementPendingOutcome(
            database,
            {
              locationId: input.command.locationId,
              productionOrderId: input.command.productionOrderId,
              pendingPlacement: input.pendingPlacement,
              now: input.now,
            },
            schema,
          ),
        commitPlacement: (input) =>
          commitPlacement(database, dependencies.ids, input, schema),
        appendWorkEvent: (input) =>
          appendPlaceOrderExactlyWorkEvent(
            database,
            schema,
            dependencies.ids,
            input,
          ),
      }) satisfies PlaceOrderExactlyTransactionRepository<StoredPlaceOrderExactlyWorkEvent>,
  );
  const unitOfWork =
    dependencies.observeUnitOfWork?.(nativeUnitOfWork) ?? nativeUnitOfWork;

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
