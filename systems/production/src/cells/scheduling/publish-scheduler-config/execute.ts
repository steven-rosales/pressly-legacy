import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { IdSource } from '@pressly/cells/id-source';
import { decidePublishSchedulerConfig } from './decide.ts';
import { publishSchedulerConfigIdempotencyConflict } from './failures.ts';
import type {
  PublishSchedulerConfigCommand,
  PublishSchedulerConfigExpectedFailure,
  SchedulerConfig,
} from './types.ts';

export type PublishSchedulerConfigWorkEventCommand = Readonly<{
  operation: 'scheduler_config_published';
  locationId: string;
  actorId: string;
  target: Readonly<{
    entityType: 'scheduler_config';
    entityId: null;
  }>;
  expectedVersion: null;
  payload: Readonly<{
    pulseMinutes: number;
    foldLbsPerFolderMinute: number;
    stageFitAssertion: PublishSchedulerConfigCommand['stageFitAssertion'];
  }>;
}>;

export type PublishSchedulerConfigReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; result: SchedulerConfig }>;

export type PublishSchedulerConfigIdempotency<StoredWorkEvent> = Readonly<{
  resolveReplay: (
    stored: StoredWorkEvent | null,
    expected: PublishSchedulerConfigWorkEventCommand,
  ) => PublishSchedulerConfigReplay;
}>;

export type PublishSchedulerConfigWorkEventInput = Readonly<{
  locationId: string;
  eventType: 'scheduler_config_published';
  entityType: 'scheduler_config';
  entityId: string;
  actorId: string;
  idempotencyKey: string;
  payload: Readonly<{ version: number }>;
  idempotency: Readonly<{
    command: PublishSchedulerConfigWorkEventCommand;
    result: SchedulerConfig;
  }>;
}>;

export type PublishSchedulerConfigTransactionRepository<StoredWorkEvent> =
  Readonly<{
    findWorkEvent: (idempotencyKey: string) => Promise<StoredWorkEvent | null>;
    lockLocationScheduling: (locationId: string) => Promise<void>;
    nextSchedulerConfigVersion: (locationId: string) => Promise<number>;
    saveSchedulerConfig: (
      locationId: string,
      config: SchedulerConfig,
    ) => Promise<SchedulerConfig>;
    appendWorkEvent: (
      event: PublishSchedulerConfigWorkEventInput,
    ) => Promise<void>;
  }>;

export type PublishSchedulerConfigRepository<StoredWorkEvent> = Readonly<{
  transaction: (
    work: (
      repository: PublishSchedulerConfigTransactionRepository<StoredWorkEvent>,
    ) => Promise<
      CellOutcome<SchedulerConfig, PublishSchedulerConfigExpectedFailure>
    >,
  ) => Promise<
    CellOutcome<SchedulerConfig, PublishSchedulerConfigExpectedFailure>
  >;
}>;

export type PublishSchedulerConfigDependencies<StoredWorkEvent> = Readonly<{
  repo: PublishSchedulerConfigRepository<StoredWorkEvent>;
  idempotency: PublishSchedulerConfigIdempotency<StoredWorkEvent>;
  clock: Readonly<{ now: () => Date }>;
  ids: IdSource;
}>;

export type ExecutePublishSchedulerConfig = (
  command: PublishSchedulerConfigCommand,
) => Promise<
  CellOutcome<SchedulerConfig, PublishSchedulerConfigExpectedFailure>
>;

const success = (
  value: SchedulerConfig,
): CellOutcome<SchedulerConfig, PublishSchedulerConfigExpectedFailure> => ({
  kind: 'success',
  value,
});

const failure = (
  value: PublishSchedulerConfigExpectedFailure,
): CellOutcome<SchedulerConfig, PublishSchedulerConfigExpectedFailure> => ({
  kind: 'failure',
  failure: value,
});

const workEventCommand = (
  command: PublishSchedulerConfigCommand,
): PublishSchedulerConfigWorkEventCommand => ({
  operation: 'scheduler_config_published',
  locationId: command.locationId,
  actorId: command.actorId,
  target: { entityType: 'scheduler_config', entityId: null },
  expectedVersion: null,
  payload: {
    pulseMinutes: command.pulseMinutes,
    foldLbsPerFolderMinute: command.foldLbsPerFolderMinute,
    stageFitAssertion: command.stageFitAssertion,
  },
});

export const makeExecutePublishSchedulerConfig = <StoredWorkEvent>(
  deps: PublishSchedulerConfigDependencies<StoredWorkEvent>,
): ExecutePublishSchedulerConfig => {
  return async (command) => {
    const decision = decidePublishSchedulerConfig(command);
    if (decision.kind === 'reject') return failure(decision.failure);

    try {
      return await deps.repo.transaction(async (repo) => {
        const idempotency = workEventCommand(command);
        const replay = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.kind === 'conflict')
          return failure(publishSchedulerConfigIdempotencyConflict());
        if (replay.kind === 'replay') return success(replay.result);

        await repo.lockLocationScheduling(command.locationId);
        const lockedReplay = deps.idempotency.resolveReplay(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (lockedReplay.kind === 'conflict')
          return failure(publishSchedulerConfigIdempotencyConflict());
        if (lockedReplay.kind === 'replay') return success(lockedReplay.result);

        const now = deps.clock.now();
        const config: SchedulerConfig = {
          id: deps.ids.next(),
          ...decision.config,
          version: await repo.nextSchedulerConfigVersion(command.locationId),
          stageFitAssertion: {
            ...decision.config.stageFitAssertion,
            assertedBy: command.actorId,
            assertedAt: now.toISOString(),
          },
          publishedAt: now.toISOString(),
        };

        await repo.saveSchedulerConfig(command.locationId, config);
        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'scheduler_config_published',
          entityType: 'scheduler_config',
          entityId: config.id,
          actorId: command.actorId,
          idempotencyKey: command.idempotencyKey,
          payload: { version: config.version },
          idempotency: { command: idempotency, result: config },
        });
        return success(config);
      });
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'scheduler_config_publish_failed',
          message: 'The scheduler configuration could not be published.',
          safeMessage: 'The scheduler configuration could not be published.',
          status: 503,
          cause,
        }),
      );
    }
  };
};
