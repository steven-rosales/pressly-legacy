import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { decideFreezeBatchMembership } from './decide.ts';
import type {
  FreezeBatchMembershipCommand,
  FreezeBatchMembershipExpectedFailure,
  FreezeBatchMembershipFacts,
  FreezeBatchMembershipPolicy,
  FreezeBatchMembershipResult,
} from './types.ts';

export type FreezeBatchMembershipWorkEventCommand = Readonly<{
  operation: 'batch_membership_frozen';
  locationId: string;
  actorId: string;
  target: Readonly<{ entityType: 'production_batch'; entityId: string }>;
  expectedVersion: number;
  payload: Readonly<{ action: 'freeze'; expectedQueueVersion: number }>;
}>;

export type FreezeBatchMembershipReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; result: FreezeBatchMembershipResult }>;

export type FreezeBatchMembershipIdempotency<Stored> = Readonly<{
  resolveReplay: (
    stored: Stored | null,
    expected: FreezeBatchMembershipWorkEventCommand,
  ) => FreezeBatchMembershipReplay;
}>;

export type FreezeBatchMembershipWorkEventInput = Readonly<{
  locationId: string;
  eventType: 'batch_membership_frozen';
  entityType: 'production_batch';
  entityId: string;
  actorId: string;
  expectedVersion: number;
  idempotencyKey: string;
  payload: Readonly<{
    action: 'freeze';
    authorizedAction: 'production:queue';
    queueVersion: number;
    batchVersion: number;
  }>;
  idempotency: Readonly<{
    command: FreezeBatchMembershipWorkEventCommand;
    result: FreezeBatchMembershipResult;
  }>;
}>;

export type FreezeBatchMembershipTransactionRepository<Stored> = Readonly<{
  findWorkEvent: (key: string) => Promise<Stored | null>;
  lockBatchMembershipContext: (
    locationId: string,
    productionRunId: string,
    productionBatchId: string,
  ) => Promise<FreezeBatchMembershipFacts | null>;
  freezeBatchMembership: (input: {
    command: FreezeBatchMembershipCommand;
    now: Date;
  }) => Promise<
    CellOutcome<
      FreezeBatchMembershipResult,
      FreezeBatchMembershipExpectedFailure
    >
  >;
  appendWorkEvent: (
    event: FreezeBatchMembershipWorkEventInput,
  ) => Promise<void>;
}>;

export type FreezeBatchMembershipRepository<Stored> = Readonly<{
  transaction: (
    work: (
      repo: FreezeBatchMembershipTransactionRepository<Stored>,
    ) => Promise<
      CellOutcome<
        FreezeBatchMembershipResult,
        FreezeBatchMembershipExpectedFailure
      >
    >,
  ) => Promise<
    CellOutcome<
      FreezeBatchMembershipResult,
      FreezeBatchMembershipExpectedFailure
    >
  >;
}>;

export type FreezeBatchMembershipSignals = Readonly<{
  batchFrozen: (input: Readonly<{ source: 'explicit' }>) => void;
  queueConflict: (input: Readonly<{ operation: 'freeze_membership' }>) => void;
}>;

export type FreezeBatchMembershipDependencies<Stored> = Readonly<{
  repo: FreezeBatchMembershipRepository<Stored>;
  idempotency: FreezeBatchMembershipIdempotency<Stored>;
  policy: FreezeBatchMembershipPolicy;
  clock: Readonly<{ now: () => Date }>;
  signals?: FreezeBatchMembershipSignals;
}>;

const success = (value: FreezeBatchMembershipResult) =>
  ({ kind: 'success', value }) as const;
const failure = (value: FreezeBatchMembershipExpectedFailure) =>
  ({ kind: 'failure', failure: value }) as const;

const idempotencyConflict = (): FreezeBatchMembershipExpectedFailure => ({
  kind: 'conflict',
  code: 'production_idempotency_conflict',
  message: 'The idempotency key belongs to a different production command.',
  safeMessage: 'The idempotency key belongs to a different production command.',
});

const commandEnvelope = (
  command: FreezeBatchMembershipCommand,
): FreezeBatchMembershipWorkEventCommand => ({
  operation: 'batch_membership_frozen',
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: 'production_batch',
    entityId: command.productionBatchId,
  },
  expectedVersion: command.expectedBatchVersion,
  payload: {
    action: 'freeze',
    expectedQueueVersion: command.expectedQueueVersion,
  },
});

export const makeExecuteFreezeBatchMembership =
  <Stored>(deps: FreezeBatchMembershipDependencies<Stored>) =>
  async (
    command: FreezeBatchMembershipCommand,
  ): Promise<
    CellOutcome<
      FreezeBatchMembershipResult,
      FreezeBatchMembershipExpectedFailure
    >
  > => {
    let outcome: CellOutcome<
      FreezeBatchMembershipResult,
      FreezeBatchMembershipExpectedFailure
    >;
    try {
      outcome = await deps.repo.transaction(async (repo) => {
        const envelope = commandEnvelope(command);
        const replayBefore = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          envelope,
        );
        if (replayBefore.kind === 'conflict')
          return failure(idempotencyConflict());
        if (replayBefore.kind === 'replay') return success(replayBefore.result);

        const facts = await repo.lockBatchMembershipContext(
          command.locationId,
          command.productionRunId,
          command.productionBatchId,
        );
        const replayAfter = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          envelope,
        );
        if (replayAfter.kind === 'conflict')
          return failure(idempotencyConflict());
        if (replayAfter.kind === 'replay') return success(replayAfter.result);

        const decision = decideFreezeBatchMembership({
          command,
          facts,
          policy: deps.policy,
        });
        if (decision.kind === 'reject') return failure(decision.failure);

        const mutation = await repo.freezeBatchMembership({
          command,
          now: deps.clock.now(),
        });
        if (mutation.kind === 'failure') return mutation;
        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'batch_membership_frozen',
          entityType: 'production_batch',
          entityId: command.productionBatchId,
          actorId: command.actorId,
          expectedVersion: command.expectedBatchVersion,
          idempotencyKey: command.idempotencyKey,
          payload: {
            action: 'freeze',
            authorizedAction: 'production:queue',
            queueVersion: mutation.value.queueVersion,
            batchVersion: mutation.value.batchVersion,
          },
          idempotency: { command: envelope, result: mutation.value },
        });
        return mutation;
      });
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'batch_membership_change_failed',
          message: 'Production batch membership could not be changed.',
          safeMessage: 'Production batch membership could not be changed.',
          status: 503,
          cause,
        }),
      );
    }

    if (outcome.kind === 'success' && !outcome.value.replayed)
      deps.signals?.batchFrozen({ source: 'explicit' });
    else if (
      outcome.kind === 'failure' &&
      outcome.failure.code === 'production_queue_version_conflict'
    )
      deps.signals?.queueConflict({ operation: 'freeze_membership' });
    return outcome;
  };
