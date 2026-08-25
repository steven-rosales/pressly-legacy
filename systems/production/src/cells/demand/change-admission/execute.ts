import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { decideChangeAdmission } from './decide.ts';
import type {
  ChangeAdmissionCommand,
  ChangeAdmissionExpectedFailure,
  ChangeAdmissionFacts,
  ChangeAdmissionPolicy,
  ChangeAdmissionResult,
} from './types.ts';

export type ChangeAdmissionWorkEventCommand = Readonly<{
  operation: 'production_admission_changed';
  locationId: string;
  actorId: string;
  target: Readonly<{
    entityType: 'production_order';
    entityId: string;
  }>;
  expectedVersion: number;
  payload: Readonly<{ target: 'released' | 'source' }>;
}>;

export type ChangeAdmissionReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; result: ChangeAdmissionResult }>;

export type ChangeAdmissionIdempotency<StoredWorkEvent> = Readonly<{
  resolveReplay: (
    stored: StoredWorkEvent | null,
    expected: ChangeAdmissionWorkEventCommand,
  ) => ChangeAdmissionReplay;
}>;

export type ChangeAdmissionWorkEventInput = Readonly<{
  locationId: string;
  eventType: 'production_admission_changed';
  entityType: 'production_order';
  entityId: string;
  actorId: string;
  expectedVersion: number;
  idempotencyKey: string;
  payload: Readonly<{
    target: 'released' | 'source';
    sourceAdmissionState: ChangeAdmissionFacts['sourceAdmissionState'];
    admissionOverride: 'released' | null;
    status: ChangeAdmissionResult['status'];
    version: number;
  }>;
  idempotency: Readonly<{
    command: ChangeAdmissionWorkEventCommand;
    result: ChangeAdmissionResult;
  }>;
}>;

export type ChangeAdmissionTransactionRepository<StoredWorkEvent> = Readonly<{
  findWorkEvent: (idempotencyKey: string) => Promise<StoredWorkEvent | null>;
  lockLocationScheduling: (locationId: string) => Promise<void>;
  lockOrder: (
    locationId: string,
    productionOrderId: string,
  ) => Promise<ChangeAdmissionFacts | null>;
  changeAdmission: (input: {
    locationId: string;
    productionOrderId: string;
    actorId: string;
    expectedVersion: number;
    admissionOverride: 'released' | null;
    nextStatus: 'release_pending' | 'intake_pending' | 'eligible';
    now: Date;
  }) => Promise<ChangeAdmissionResult | null>;
  appendWorkEvent: (event: ChangeAdmissionWorkEventInput) => Promise<void>;
}>;

export type ChangeAdmissionRepository<StoredWorkEvent> = Readonly<{
  transaction: (
    work: (
      repository: ChangeAdmissionTransactionRepository<StoredWorkEvent>,
    ) => Promise<
      CellOutcome<ChangeAdmissionResult, ChangeAdmissionExpectedFailure>
    >,
  ) => Promise<
    CellOutcome<ChangeAdmissionResult, ChangeAdmissionExpectedFailure>
  >;
}>;

export type ChangeAdmissionDependencies<StoredWorkEvent> = Readonly<{
  repo: ChangeAdmissionRepository<StoredWorkEvent>;
  idempotency: ChangeAdmissionIdempotency<StoredWorkEvent>;
  policy: ChangeAdmissionPolicy;
  clock: Readonly<{ now: () => Date }>;
}>;

export type ExecuteChangeAdmission = (
  command: ChangeAdmissionCommand,
) => Promise<
  CellOutcome<ChangeAdmissionResult, ChangeAdmissionExpectedFailure>
>;

const success = (
  value: ChangeAdmissionResult,
): CellOutcome<ChangeAdmissionResult, ChangeAdmissionExpectedFailure> => ({
  kind: 'success',
  value,
});

const failure = (
  value: ChangeAdmissionExpectedFailure,
): CellOutcome<ChangeAdmissionResult, ChangeAdmissionExpectedFailure> => ({
  kind: 'failure',
  failure: value,
});

const idempotencyConflict = (): ChangeAdmissionExpectedFailure => ({
  kind: 'conflict',
  code: 'production_idempotency_conflict',
  message: 'The idempotency key belongs to a different production command.',
  safeMessage: 'The idempotency key belongs to a different production command.',
});

const eventCommand = (
  command: ChangeAdmissionCommand,
): ChangeAdmissionWorkEventCommand => ({
  operation: 'production_admission_changed',
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: 'production_order',
    entityId: command.productionOrderId,
  },
  expectedVersion: command.expectedVersion,
  payload: { target: command.target },
});

const lateVersionConflict = (): ChangeAdmissionExpectedFailure => ({
  kind: 'conflict',
  code: 'production_order_version_conflict',
  message:
    'The order changed before its production admission was updated. Refresh and try again.',
  safeMessage:
    'The order changed before its production admission was updated. Refresh and try again.',
});

export const makeExecuteChangeAdmission =
  <StoredWorkEvent>(
    deps: ChangeAdmissionDependencies<StoredWorkEvent>,
  ): ExecuteChangeAdmission =>
  async (command) => {
    try {
      return await deps.repo.transaction(async (repo) => {
        const idempotency = eventCommand(command);
        const replay = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.kind === 'conflict') return failure(idempotencyConflict());
        if (replay.kind === 'replay') return success(replay.result);

        await repo.lockLocationScheduling(command.locationId);
        const lockedReplay = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (lockedReplay.kind === 'conflict')
          return failure(idempotencyConflict());
        if (lockedReplay.kind === 'replay') return success(lockedReplay.result);

        const facts = await repo.lockOrder(
          command.locationId,
          command.productionOrderId,
        );
        const decision = decideChangeAdmission({
          command,
          facts,
          policy: deps.policy,
        });
        if (decision.kind === 'reject') return failure(decision.failure);

        const mutation = await repo.changeAdmission({
          locationId: command.locationId,
          productionOrderId: command.productionOrderId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          admissionOverride: decision.admissionOverride,
          nextStatus: decision.nextStatus,
          now: deps.clock.now(),
        });
        if (mutation === null) return failure(lateVersionConflict());

        if (facts === null)
          return failure({
            kind: 'not_found',
            code: 'production_order_not_found',
            message: 'The production order was not found.',
            safeMessage: 'The production order was not found.',
          });
        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'production_admission_changed',
          entityType: 'production_order',
          entityId: command.productionOrderId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
          payload: {
            target: command.target,
            sourceAdmissionState: facts.sourceAdmissionState,
            admissionOverride: mutation.admissionOverride,
            status: mutation.status,
            version: mutation.version,
          },
          idempotency: { command: idempotency, result: mutation },
        });
        return success(mutation);
      });
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_admission_change_failed',
          message: 'The production admission could not be changed.',
          safeMessage: 'The production admission could not be changed.',
          status: 503,
          cause,
        }),
      );
    }
  };
