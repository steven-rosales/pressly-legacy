import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import {
  decideApplyFulfillmentDemand,
  validateApplyFulfillmentDemand,
} from './decide.ts';
import {
  applyFulfillmentDemandIdempotencyConflict,
  applyFulfillmentDemandValidationFailure,
  applyFulfillmentDemandVersionConflict,
  expectedApplyFulfillmentDemandFailureFromThrowable,
} from './failures.ts';
import type {
  ApplyFulfillmentDemandCommand,
  ApplyFulfillmentDemandExpectedFailure,
  ApplyFulfillmentDemandPolicy,
  ApplyFulfillmentDemandResult,
  FulfillmentProductionMutation,
  StoredFulfillmentDemand,
} from './types.ts';

export type ApplyFulfillmentDemandWorkEventCommand = Readonly<{
  operation: 'fulfillment_demand_applied';
  locationId: string;
  actorId: '00000000-0000-4000-8000-000000000000';
  target: Readonly<{
    entityType: 'order_demand';
    entityId: null;
  }>;
  expectedVersion: null;
  payload: Readonly<{
    fulfillmentId: string;
    fulfillmentVersion: number;
    projectionHash: string;
    displayReference: string | null;
    admissionState: ApplyFulfillmentDemandCommand['admissionState'];
    commercialState: ApplyFulfillmentDemandCommand['commercialState'];
    dueAt: string;
    observedAt: string;
    estimatedWeightLbs: number | null;
    estimatedWeightSource: 'external_estimate' | null;
  }>;
}>;

export type ApplyFulfillmentDemandReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{
      kind: 'replay';
      result: ApplyFulfillmentDemandResult;
    }>;

export type ApplyFulfillmentDemandWorkEventInput = Readonly<{
  locationId: string;
  eventType: 'fulfillment_demand_applied';
  entityType: 'order_demand';
  entityId: string;
  actorId: '00000000-0000-4000-8000-000000000000';
  idempotencyKey: string;
  payload: Readonly<{ outcome: ApplyFulfillmentDemandResult['outcome'] }>;
  idempotency: Readonly<{
    command: ApplyFulfillmentDemandWorkEventCommand;
    result: ApplyFulfillmentDemandResult;
  }>;
}>;

export type ApplyFulfillmentDemandMutationResult =
  | Readonly<{
      kind: 'stored';
      demand: StoredFulfillmentDemand;
    }>
  | Readonly<{ kind: 'version_conflict' }>;

export type ApplyFulfillmentDemandTransactionRepository<StoredWorkEvent> =
  Readonly<{
    findWorkEvent: (idempotencyKey: string) => Promise<StoredWorkEvent | null>;
    locationIsActive: (locationId: string) => Promise<boolean>;
    lockLocationScheduling: (locationId: string) => Promise<void>;
    lockFulfillment: (fulfillmentId: string) => Promise<void>;
    loadDemand: (
      fulfillmentId: string,
    ) => Promise<StoredFulfillmentDemand | null>;
    applyDemand: (input: {
      command: ApplyFulfillmentDemandCommand;
      orderDemandId: string;
      production: FulfillmentProductionMutation;
      initialExecutionState: 'unassigned';
      now: Date;
    }) => Promise<ApplyFulfillmentDemandMutationResult>;
    appendWorkEvent: (
      event: ApplyFulfillmentDemandWorkEventInput,
    ) => Promise<void>;
  }>;

export type ApplyFulfillmentDemandRepository<StoredWorkEvent> = Readonly<{
  transaction: (
    work: (
      repository: ApplyFulfillmentDemandTransactionRepository<StoredWorkEvent>,
    ) => Promise<
      CellOutcome<
        ApplyFulfillmentDemandResult,
        ApplyFulfillmentDemandExpectedFailure
      >
    >,
  ) => Promise<
    CellOutcome<
      ApplyFulfillmentDemandResult,
      ApplyFulfillmentDemandExpectedFailure
    >
  >;
}>;

export type ApplyFulfillmentDemandIdempotency<StoredWorkEvent> = Readonly<{
  resolveReplay: (
    stored: StoredWorkEvent | null,
    expected: ApplyFulfillmentDemandWorkEventCommand,
  ) => ApplyFulfillmentDemandReplay;
}>;

export type ApplyFulfillmentDemandDependencies<StoredWorkEvent> = Readonly<{
  repo: ApplyFulfillmentDemandRepository<StoredWorkEvent>;
  idempotency: ApplyFulfillmentDemandIdempotency<StoredWorkEvent>;
  policy: ApplyFulfillmentDemandPolicy;
  clock: Readonly<{ now: () => Date }>;
  ids: Readonly<{ next: () => string }>;
}>;

export type ExecuteApplyFulfillmentDemand = (
  command: ApplyFulfillmentDemandCommand,
) => Promise<
  CellOutcome<
    ApplyFulfillmentDemandResult,
    ApplyFulfillmentDemandExpectedFailure
  >
>;

const success = (
  value: ApplyFulfillmentDemandResult,
): CellOutcome<
  ApplyFulfillmentDemandResult,
  ApplyFulfillmentDemandExpectedFailure
> => ({ kind: 'success', value });

const failure = (
  value: ApplyFulfillmentDemandExpectedFailure,
): CellOutcome<
  ApplyFulfillmentDemandResult,
  ApplyFulfillmentDemandExpectedFailure
> => ({ kind: 'failure', failure: value });

export const applyFulfillmentDemandWorkEventCommand = (
  command: ApplyFulfillmentDemandCommand,
): ApplyFulfillmentDemandWorkEventCommand => ({
  operation: 'fulfillment_demand_applied',
  locationId: command.locationId,
  actorId: '00000000-0000-4000-8000-000000000000',
  target: { entityType: 'order_demand', entityId: null },
  expectedVersion: null,
  payload: {
    fulfillmentId: command.fulfillmentId,
    fulfillmentVersion: command.fulfillmentVersion,
    projectionHash: command.projectionHash,
    displayReference: command.displayReference,
    admissionState: command.admissionState,
    commercialState: command.commercialState,
    dueAt: command.dueAt,
    observedAt: command.observedAt,
    estimatedWeightLbs: command.estimatedWeightLbs,
    estimatedWeightSource: command.estimatedWeightSource,
  },
});

export const makeExecuteApplyFulfillmentDemand =
  <StoredWorkEvent>(
    deps: ApplyFulfillmentDemandDependencies<StoredWorkEvent>,
  ): ExecuteApplyFulfillmentDemand =>
  async (command) => {
    try {
      return await deps.repo.transaction(async (repo) => {
        const idempotency = applyFulfillmentDemandWorkEventCommand(command);
        const replay = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.kind === 'conflict')
          return failure(applyFulfillmentDemandIdempotencyConflict());
        if (replay.kind === 'replay') return success(replay.result);

        const invalid = validateApplyFulfillmentDemand(command);
        if (invalid !== null) return failure(invalid);

        if (!(await repo.locationIsActive(command.locationId)))
          return failure(
            applyFulfillmentDemandValidationFailure({
              code: 'production_location_unavailable',
              message: 'The production location is missing or inactive.',
            }),
          );

        await repo.lockLocationScheduling(command.locationId);
        await repo.lockFulfillment(command.fulfillmentId);
        const lockedReplay = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (lockedReplay.kind === 'conflict')
          return failure(applyFulfillmentDemandIdempotencyConflict());
        if (lockedReplay.kind === 'replay') return success(lockedReplay.result);

        const existing = await repo.loadDemand(command.fulfillmentId);
        const orderDemandId = existing?.orderDemandId ?? deps.ids.next();
        const decision = decideApplyFulfillmentDemand({
          command,
          existing,
          policy: deps.policy,
        });
        if (decision.kind === 'reject') return failure(decision.failure);

        const appendOutcome = async (
          value: ApplyFulfillmentDemandResult,
        ): Promise<void> =>
          repo.appendWorkEvent({
            locationId: command.locationId,
            eventType: 'fulfillment_demand_applied',
            entityType: 'order_demand',
            entityId: orderDemandId,
            actorId: '00000000-0000-4000-8000-000000000000',
            idempotencyKey: command.idempotencyKey,
            payload: { outcome: value.outcome },
            idempotency: { command: idempotency, result: value },
          });

        if (decision.kind === 'audit') {
          const value: ApplyFulfillmentDemandResult = {
            orderDemandId,
            productionOrderId: existing?.productionOrderId ?? null,
            outcome: decision.outcome,
            replayed: false,
          };
          await appendOutcome(value);
          return success(value);
        }

        const mutation = await repo.applyDemand({
          command,
          orderDemandId,
          production: decision.production,
          initialExecutionState: decision.initialExecutionState,
          now: deps.clock.now(),
        });
        if (mutation.kind === 'version_conflict')
          return failure(applyFulfillmentDemandVersionConflict());

        const value: ApplyFulfillmentDemandResult = {
          orderDemandId,
          productionOrderId: mutation.demand.productionOrderId,
          outcome: 'applied',
          replayed: false,
        };
        await appendOutcome(value);
        return success(value);
      });
    } catch (error) {
      const expected =
        expectedApplyFulfillmentDemandFailureFromThrowable(error);
      if (expected !== null) return failure(expected);
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'fulfillment_demand_application_failed',
          message: 'The fulfillment demand could not be applied.',
          safeMessage: 'The fulfillment demand could not be applied.',
          status: 503,
          cause,
        }),
      );
    }
  };
