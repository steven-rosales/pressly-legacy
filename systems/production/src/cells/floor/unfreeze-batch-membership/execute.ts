import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { decideUnfreezeBatchMembership } from './decide.ts';
import type {
  UnfreezeBatchMembershipCommand,
  UnfreezeBatchMembershipExpectedFailure,
  UnfreezeBatchMembershipFacts,
  UnfreezeBatchMembershipPolicy,
  UnfreezeBatchMembershipResult,
} from './types.ts';

export type UnfreezeBatchMembershipWorkEventCommand = Readonly<{
  operation: 'batch_membership_unfrozen';
  locationId: string;
  actorId: string;
  target: Readonly<{ entityType: 'production_batch'; entityId: string }>;
  expectedVersion: number;
  payload: Readonly<{ action: 'unfreeze'; expectedQueueVersion: number }>;
}>;

export type UnfreezeBatchMembershipReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; result: UnfreezeBatchMembershipResult }>;

export type UnfreezeBatchMembershipIdempotency<Stored> = Readonly<{
  resolveReplay: (
    stored: Stored | null,
    expected: UnfreezeBatchMembershipWorkEventCommand,
  ) => UnfreezeBatchMembershipReplay;
}>;

export type UnfreezeBatchMembershipWorkEventInput = Readonly<{
  locationId: string;
  eventType: 'batch_membership_unfrozen';
  entityType: 'production_batch';
  entityId: string;
  actorId: string;
  expectedVersion: number;
  idempotencyKey: string;
  payload: Readonly<{
    action: 'unfreeze';
    authorizedAction: 'production:override';
    queueVersion: number;
    batchVersion: number;
  }>;
  idempotency: Readonly<{
    command: UnfreezeBatchMembershipWorkEventCommand;
    result: UnfreezeBatchMembershipResult;
  }>;
}>;

export type UnfreezeBatchMembershipTransactionRepository<Stored> = Readonly<{
  findWorkEvent: (key: string) => Promise<Stored | null>;
  lockBatchMembershipContext: (
    locationId: string,
    productionRunId: string,
    productionBatchId: string,
  ) => Promise<UnfreezeBatchMembershipFacts | null>;
  unfreezeBatchMembership: (input: {
    command: UnfreezeBatchMembershipCommand;
    now: Date;
  }) => Promise<
    CellOutcome<
      UnfreezeBatchMembershipResult,
      UnfreezeBatchMembershipExpectedFailure
    >
  >;
  appendWorkEvent: (
    event: UnfreezeBatchMembershipWorkEventInput,
  ) => Promise<void>;
}>;

export type UnfreezeBatchMembershipRepository<Stored> = Readonly<{
  transaction: (
    work: (
      repo: UnfreezeBatchMembershipTransactionRepository<Stored>,
    ) => Promise<
      CellOutcome<
        UnfreezeBatchMembershipResult,
        UnfreezeBatchMembershipExpectedFailure
      >
    >,
  ) => Promise<
    CellOutcome<
      UnfreezeBatchMembershipResult,
      UnfreezeBatchMembershipExpectedFailure
    >
  >;
}>;

export type UnfreezeBatchMembershipSignals = Readonly<{
  queueConflict: (
    input: Readonly<{ operation: 'unfreeze_membership' }>,
  ) => void;
}>;

export type UnfreezeBatchMembershipDependencies<Stored> = Readonly<{
  repo: UnfreezeBatchMembershipRepository<Stored>;
  idempotency: UnfreezeBatchMembershipIdempotency<Stored>;
  policy: UnfreezeBatchMembershipPolicy;
  clock: Readonly<{ now: () => Date }>;
  signals?: UnfreezeBatchMembershipSignals;
}>;

const success = (value: UnfreezeBatchMembershipResult) =>
  ({ kind: 'success', value }) as const;
const failure = (value: UnfreezeBatchMembershipExpectedFailure) =>
  ({ kind: 'failure', failure: value }) as const;

const idempotencyConflict = (): UnfreezeBatchMembershipExpectedFailure => ({
  kind: 'conflict',
  code: 'production_idempotency_conflict',
  message: 'The idempotency key belongs to a different production command.',
  safeMessage: 'The idempotency key belongs to a different production command.',
});

const envelope = (
  command: UnfreezeBatchMembershipCommand,
): UnfreezeBatchMembershipWorkEventCommand => ({
  operation: 'batch_membership_unfrozen',
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: 'production_batch',
    entityId: command.productionBatchId,
  },
  expectedVersion: command.expectedBatchVersion,
  payload: {
    action: 'unfreeze',
    expectedQueueVersion: command.expectedQueueVersion,
  },
});

export const makeExecuteUnfreezeBatchMembership =
  <Stored>(deps: UnfreezeBatchMembershipDependencies<Stored>) =>
  async (
    command: UnfreezeBatchMembershipCommand,
  ): Promise<
    CellOutcome<
      UnfreezeBatchMembershipResult,
      UnfreezeBatchMembershipExpectedFailure
    >
  > => {
    let outcome: CellOutcome<
      UnfreezeBatchMembershipResult,
      UnfreezeBatchMembershipExpectedFailure
    >;
    try {
      outcome = await deps.repo.transaction(async (repo) => {
        const commandEnvelope = envelope(command);
        const before = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          commandEnvelope,
        );
        if (before.kind === 'conflict') return failure(idempotencyConflict());
        if (before.kind === 'replay') return success(before.result);
        const facts = await repo.lockBatchMembershipContext(
          command.locationId,
          command.productionRunId,
          command.productionBatchId,
        );
        const after = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          commandEnvelope,
        );
        if (after.kind === 'conflict') return failure(idempotencyConflict());
        if (after.kind === 'replay') return success(after.result);
        const decision = decideUnfreezeBatchMembership({
          command,
          facts,
          policy: deps.policy,
        });
        if (decision.kind === 'reject') return failure(decision.failure);
        const mutation = await repo.unfreezeBatchMembership({
          command,
          now: deps.clock.now(),
        });
        if (mutation.kind === 'failure') return mutation;
        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'batch_membership_unfrozen',
          entityType: 'production_batch',
          entityId: command.productionBatchId,
          actorId: command.actorId,
          expectedVersion: command.expectedBatchVersion,
          idempotencyKey: command.idempotencyKey,
          payload: {
            action: 'unfreeze',
            authorizedAction: 'production:override',
            queueVersion: mutation.value.queueVersion,
            batchVersion: mutation.value.batchVersion,
          },
          idempotency: { command: commandEnvelope, result: mutation.value },
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
    if (
      outcome.kind === 'failure' &&
      outcome.failure.code === 'production_queue_version_conflict'
    )
      deps.signals?.queueConflict({ operation: 'unfreeze_membership' });
    return outcome;
  };
