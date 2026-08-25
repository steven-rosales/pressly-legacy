import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { decideChangeOrderResolution } from './decide.ts';
import type {
  ChangeOrderResolutionCommand,
  ChangeOrderResolutionExpectedFailure,
  ChangeOrderResolutionFacts,
  ChangeOrderResolutionPolicy,
  ChangeOrderResolutionResult,
  RestoredOrderSourceProjection,
} from './types.ts';

type ResolutionEventType =
  | 'production_order_resolved_without_production'
  | 'production_order_restored';

export type ChangeOrderResolutionWorkEventCommand = Readonly<{
  operation: ResolutionEventType;
  locationId: string;
  actorId: string;
  target: Readonly<{
    entityType: 'production_order';
    entityId: string;
  }>;
  expectedVersion: number;
  payload: Readonly<{
    action: ChangeOrderResolutionCommand['action'];
    reason: string;
    note: string | null;
    confirmReviewedFacts?: boolean;
    sourceStatePrecondition?: Readonly<{
      commercialState: 'open';
      admissionState: 'unreleased';
    }>;
  }>;
}>;

export type ChangeOrderResolutionReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; result: ChangeOrderResolutionResult }>;

export type ChangeOrderResolutionIdempotency<StoredWorkEvent> = Readonly<{
  resolveReplay: (
    stored: StoredWorkEvent | null,
    expected: ChangeOrderResolutionWorkEventCommand,
  ) => ChangeOrderResolutionReplay;
}>;

export type ChangeOrderResolutionWorkEventInput = Readonly<{
  locationId: string;
  eventType: ResolutionEventType;
  entityType: 'production_order';
  entityId: string;
  actorId: string;
  expectedVersion: number;
  idempotencyKey: string;
  payload: Readonly<{
    action: ChangeOrderResolutionCommand['action'];
    from: 'open' | 'resolved_without_production';
    resolutionState: ChangeOrderResolutionResult['resolutionState'];
    reason: string;
    note: string | null;
    reviewReasons: readonly string[];
    clearedPendingPlacement: boolean;
    restoredSourceProjection?: Readonly<{
      dueAt: string;
      derivedWeightLbs: number;
      operationalStatus: RestoredOrderSourceProjection['operationalStatus'];
    }>;
    version: number;
  }>;
  idempotency: Readonly<{
    command: ChangeOrderResolutionWorkEventCommand;
    result: ChangeOrderResolutionResult;
  }>;
}>;

export type ChangeOrderResolutionMutationInput = Readonly<{
  locationId: string;
  productionOrderId: string;
  actorId: string;
  expectedVersion: number;
  lifecycle: Readonly<{
    from: 'open' | 'resolved_without_production';
    state: 'open' | 'resolved_without_production';
  }>;
  reason: string;
  note: string | null;
  clearPendingPlacement: boolean;
  restoredSourceProjection: RestoredOrderSourceProjection | null;
  now: Date;
}>;

export type ChangeOrderResolutionTransactionRepository<StoredWorkEvent> =
  Readonly<{
    findWorkEvent: (idempotencyKey: string) => Promise<StoredWorkEvent | null>;
    lockLocationScheduling: (locationId: string) => Promise<void>;
    lockOrder: (
      locationId: string,
      productionOrderId: string,
    ) => Promise<ChangeOrderResolutionFacts | null>;
    changeResolution: (
      input: ChangeOrderResolutionMutationInput,
    ) => Promise<ChangeOrderResolutionResult | null>;
    appendWorkEvent: (
      event: ChangeOrderResolutionWorkEventInput,
    ) => Promise<void>;
  }>;

export type ChangeOrderResolutionRepository<StoredWorkEvent> = Readonly<{
  transaction: (
    work: (
      repository: ChangeOrderResolutionTransactionRepository<StoredWorkEvent>,
    ) => Promise<
      CellOutcome<
        ChangeOrderResolutionResult,
        ChangeOrderResolutionExpectedFailure
      >
    >,
  ) => Promise<
    CellOutcome<
      ChangeOrderResolutionResult,
      ChangeOrderResolutionExpectedFailure
    >
  >;
}>;

export type ChangeOrderResolutionDependencies<StoredWorkEvent> = Readonly<{
  repo: ChangeOrderResolutionRepository<StoredWorkEvent>;
  idempotency: ChangeOrderResolutionIdempotency<StoredWorkEvent>;
  policy: ChangeOrderResolutionPolicy;
  clock: Readonly<{ now: () => Date }>;
}>;

export type ExecuteChangeOrderResolution = (
  command: ChangeOrderResolutionCommand,
) => Promise<
  CellOutcome<ChangeOrderResolutionResult, ChangeOrderResolutionExpectedFailure>
>;

const success = (
  value: ChangeOrderResolutionResult,
): CellOutcome<
  ChangeOrderResolutionResult,
  ChangeOrderResolutionExpectedFailure
> => ({
  kind: 'success',
  value,
});

const failure = (
  value: ChangeOrderResolutionExpectedFailure,
): CellOutcome<
  ChangeOrderResolutionResult,
  ChangeOrderResolutionExpectedFailure
> => ({
  kind: 'failure',
  failure: value,
});

const idempotencyConflict = (): ChangeOrderResolutionExpectedFailure => ({
  kind: 'conflict',
  code: 'production_idempotency_conflict',
  message: 'The idempotency key belongs to a different production command.',
  safeMessage: 'The idempotency key belongs to a different production command.',
});

const lateVersionConflict = (): ChangeOrderResolutionExpectedFailure => ({
  kind: 'conflict',
  code: 'production_order_version_conflict',
  message:
    'The order changed before its archive status was updated. Refresh and try again.',
  safeMessage:
    'The order changed before its archive status was updated. Refresh and try again.',
});

const eventType = (
  command: ChangeOrderResolutionCommand,
): ResolutionEventType =>
  command.action === 'resolve_without_production'
    ? 'production_order_resolved_without_production'
    : 'production_order_restored';

const eventCommand = (
  command: ChangeOrderResolutionCommand,
): ChangeOrderResolutionWorkEventCommand => ({
  operation: eventType(command),
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: 'production_order',
    entityId: command.productionOrderId,
  },
  expectedVersion: command.expectedVersion,
  payload: {
    action: command.action,
    reason: command.reason,
    note: command.note,
    ...(command.action === 'resolve_without_production'
      ? {
          confirmReviewedFacts: command.confirmReviewedFacts,
          ...(command.sourceStatePrecondition === undefined
            ? {}
            : { sourceStatePrecondition: command.sourceStatePrecondition }),
        }
      : {}),
  },
});

const replayOutcome = (
  replay: ChangeOrderResolutionReplay,
): CellOutcome<
  ChangeOrderResolutionResult,
  ChangeOrderResolutionExpectedFailure
> | null => {
  if (replay.kind === 'conflict') return failure(idempotencyConflict());
  if (replay.kind === 'replay') return success(replay.result);
  return null;
};

export const makeExecuteChangeOrderResolution =
  <StoredWorkEvent>(
    deps: ChangeOrderResolutionDependencies<StoredWorkEvent>,
  ): ExecuteChangeOrderResolution =>
  async (command) => {
    try {
      return await deps.repo.transaction(async (repo) => {
        const idempotency = eventCommand(command);
        const replayBeforeLock = replayOutcome(
          deps.idempotency.resolveReplay(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          ),
        );
        if (replayBeforeLock !== null) return replayBeforeLock;

        await repo.lockLocationScheduling(command.locationId);
        const replayAfterLock = replayOutcome(
          deps.idempotency.resolveReplay(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          ),
        );
        if (replayAfterLock !== null) return replayAfterLock;

        const facts = await repo.lockOrder(
          command.locationId,
          command.productionOrderId,
        );
        const decision = decideChangeOrderResolution({
          command,
          facts,
          policy: deps.policy,
        });
        if (decision.kind === 'reject') return failure(decision.failure);

        const now = deps.clock.now();
        const changed = await repo.changeResolution({
          locationId: command.locationId,
          productionOrderId: command.productionOrderId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          lifecycle: decision.lifecycle,
          reason: command.reason,
          note: command.note,
          clearPendingPlacement: decision.clearPendingPlacement,
          restoredSourceProjection: decision.restoredSourceProjection,
          now,
        });
        if (changed === null) return failure(lateVersionConflict());

        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: idempotency.operation,
          entityType: 'production_order',
          entityId: command.productionOrderId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
          payload: {
            action: command.action,
            from: decision.lifecycle.from,
            resolutionState: changed.resolutionState,
            reason: command.reason,
            note: command.note,
            reviewReasons: decision.reviewReasons,
            clearedPendingPlacement: decision.clearPendingPlacement,
            ...(decision.restoredSourceProjection === null
              ? {}
              : {
                  restoredSourceProjection: {
                    dueAt:
                      decision.restoredSourceProjection.dueAt.toISOString(),
                    derivedWeightLbs:
                      decision.restoredSourceProjection.derivedWeightLbs,
                    operationalStatus:
                      decision.restoredSourceProjection.operationalStatus,
                  },
                }),
            version: changed.version,
          },
          idempotency: { command: idempotency, result: changed },
        });
        return success(changed);
      });
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_order_resolution_change_failed',
          message: 'The order archive status could not be changed.',
          safeMessage: 'The order archive status could not be changed.',
          status: 503,
          cause,
        }),
      );
    }
  };
