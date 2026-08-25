import { isJsonObject } from '@pressly/codec';
import type { CellOutcome } from '@pressly/cells';
import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, desc, eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import {
  defineResultUnitOfWork,
  defineUnitOfWork,
} from '@pressly/postgres/unit-of-work';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import { loadOnlineOrderPlacementLockedContext } from '../../../postgres/online-order-placement/locked-context.postgres.ts';
import {
  persistOnlineOrderPlacement,
  persistOnlineOrderPlacementPendingOutcome,
} from '../../../postgres/online-order-placement/placement-mutation.postgres.ts';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import type {
  CommitConfirmedPlacementInput,
  ConfirmOrderOvertimeRepository,
  ConfirmOrderOvertimeTransactionRepository,
} from './execute.ts';
import { confirmOrderOvertimeConcurrencyConflict } from './failures.ts';
import type { StoredConfirmOrderOvertimeWorkEvent } from './idempotency.ts';
import type {
  ConfirmOrderOvertimeExpectedFailure,
  ConfirmedProductionOrderPlacedResult,
  StoredOvertimeProposal,
} from './types.ts';
import {
  appendConfirmOrderOvertimeWorkEvent,
  findConfirmOrderOvertimeWorkEvent,
} from './work-event.postgres.ts';

const success = (
  value: ConfirmedProductionOrderPlacedResult,
): CellOutcome<
  ConfirmedProductionOrderPlacedResult,
  ConfirmOrderOvertimeExpectedFailure
> => ({ kind: 'success', value });

const failure = (
  value: ConfirmOrderOvertimeExpectedFailure,
): CellOutcome<
  ConfirmedProductionOrderPlacedResult,
  ConfirmOrderOvertimeExpectedFailure
> => ({ kind: 'failure', failure: value });

const storedOvertimeProposal = (
  value: unknown,
): StoredOvertimeProposal | null => {
  if (!isJsonObject(value)) return null;
  const mode = value['mode'];
  const targetBatchId = value['targetBatchId'];
  const proposalHash = value['proposalHash'];
  const queueVersion = value['queueVersion'];
  if (
    (mode !== 'automatic' && mode !== 'manager_exact') ||
    (targetBatchId !== null && typeof targetBatchId !== 'string') ||
    typeof proposalHash !== 'string' ||
    typeof queueVersion !== 'number'
  )
    return null;
  return { mode, targetBatchId, proposalHash, queueVersion };
};

const commitPlacement = async (
  database: PostgresExecutor,
  ids: IdSource,
  input: CommitConfirmedPlacementInput,
  schema: ProductionSchema,
): Promise<
  CellOutcome<
    ConfirmedProductionOrderPlacedResult,
    ConfirmOrderOvertimeExpectedFailure
  >
> => {
  const acknowledgesOvertime =
    input.proposal.overtime.required && input.overtimeConfirmed;
  const mutation = await persistOnlineOrderPlacement(
    database,
    ids,
    {
      command: input.command,
      context: input.context,
      proposal: input.proposal,
      mode: input.mode,
      orderLifecycle: input.orderLifecycle,
      initialBatchState: input.initialBatchState,
      initialStageState: input.initialStageState,
      initialAttemptState: input.initialAttemptState,
      overtimeAcknowledgment: acknowledgesOvertime
        ? {
            proposalHash: input.proposal.placementPlanHash,
            actorId: input.command.actorId,
            acknowledgedAt: input.now,
          }
        : null,
      now: input.now,
    },
    schema,
  );
  if (mutation.kind === 'conflict')
    return failure(
      confirmOrderOvertimeConcurrencyConflict(mutation.code, mutation.message),
    );
  return success({
    status: 'placed',
    mode: input.mode.type,
    productionRunId: input.command.productionRunId,
    productionOrderId: input.command.productionOrderId,
    ...mutation.placement,
    replayed: false,
  });
};

export type ConfirmOrderOvertimePostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makeConfirmOrderOvertimePostgresRepository = (
  deps: ConfirmOrderOvertimePostgresDependencies,
  schema: ProductionSchema,
): ConfirmOrderOvertimeRepository<StoredConfirmOrderOvertimeWorkEvent> => {
  // This unlocked lookup intentionally precedes the separately observed and
  // locked placement unit of work; replay resolution remains inside the latter.
  const proposalRead = defineUnitOfWork(deps.db, (database: PostgresExecutor) =>
    Object.freeze({
      findOvertimeProposal: async (
        locationId: string,
        productionOrderId: string,
        proposalHash: string,
      ) => {
        const rows = await database
          .select({ payload: schema.workEvents.payload })
          .from(schema.workEvents)
          .where(
            and(
              eq(schema.workEvents.locationId, locationId),
              eq(schema.workEvents.entityType, 'production_order'),
              eq(schema.workEvents.entityId, productionOrderId),
              eq(
                schema.workEvents.eventType,
                'production_order_placement_overtime_required',
              ),
            ),
          )
          .orderBy(desc(schema.workEvents.createdAt));
        return (
          rows
            .map((row) => storedOvertimeProposal(row.payload))
            .find((stored) => stored?.proposalHash === proposalHash) ?? null
        );
      },
    }),
  );
  const nativePlacementUnitOfWork = defineResultUnitOfWork(
    deps.db,
    (database: PostgresExecutor) =>
      ({
        findWorkEvent: (key) =>
          findConfirmOrderOvertimeWorkEvent(database, schema, key),
        loadContext: (locationId, productionRunId, productionOrderId) =>
          loadOnlineOrderPlacementLockedContext(
            database,
            {
              locationId,
              productionRunId,
              productionOrderId,
            },
            schema,
          ),
        recordOutcome: (input) =>
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
          commitPlacement(database, deps.ids, input, schema),
        appendWorkEvent: (event) =>
          appendConfirmOrderOvertimeWorkEvent(
            database,
            schema,
            deps.ids,
            event,
          ),
      }) satisfies ConfirmOrderOvertimeTransactionRepository<StoredConfirmOrderOvertimeWorkEvent>,
  );
  const placementUnitOfWork =
    deps.observeUnitOfWork?.(nativePlacementUnitOfWork) ??
    nativePlacementUnitOfWork;

  return Object.freeze({
    findOvertimeProposal: (locationId, productionOrderId, proposalHash) =>
      proposalRead.transaction((repository) =>
        repository.findOvertimeProposal(
          locationId,
          productionOrderId,
          proposalHash,
        ),
      ),
    transaction: async (work) => {
      const outcome = await placementUnitOfWork.transaction(
        async (repository) => {
          const cellOutcome = await work(repository);
          return cellOutcome.kind === 'success'
            ? result.ok(cellOutcome.value)
            : result.err(cellOutcome.failure);
        },
      );
      return outcome.tag === 'ok'
        ? { kind: 'success', value: outcome.value }
        : { kind: 'failure', failure: outcome.error };
    },
  });
};
