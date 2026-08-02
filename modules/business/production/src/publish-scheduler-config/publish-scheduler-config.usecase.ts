import {
  databaseError,
  mapUnknownError,
  validationError,
} from '@pressly/errors';
import { result } from '@pressly/kernel';
import type { SchedulerConfig } from '@pressly/contracts';
import type {
  ClockPort,
  IdPort,
} from '../command-execution/production-command.port.ts';
import { productionIdempotencyConflict } from '../command-execution/production-command.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../command-execution/production-idempotency.policy.ts';
import type {
  PublishSchedulerConfig,
  PublishSchedulerConfigRepository,
} from './publish-scheduler-config.port.ts';
export type { PublishSchedulerConfig } from './publish-scheduler-config.port.ts';

export const makePublishSchedulerConfig =
  (deps: {
    repo: PublishSchedulerConfigRepository;
    clock: ClockPort;
    ids: IdPort;
  }): PublishSchedulerConfig =>
  async (command) => {
    if (command.pulseMinutes <= 0 || command.foldLbsPerFolderMinute <= 0)
      return result.err(
        validationError({
          code: 'scheduler_config_invalid',
          message: 'Scheduler values must be positive.',
          safeMessage: 'Scheduler values must be positive.',
          status: 422,
        }),
      );

    try {
      return await deps.repo.transaction(async (repo) => {
        const idempotency = defineWorkEventCommand({
          operation: 'scheduler_config_published',
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'scheduler_config',
          payload: {
            pulseMinutes: command.pulseMinutes,
            foldLbsPerFolderMinute: command.foldLbsPerFolderMinute,
            stageFitAssertion: command.stageFitAssertion,
          },
        });
        const replay = resolveWorkEventReplay<SchedulerConfig>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        const now = deps.clock.now();
        const config = {
          id: deps.ids.next(),
          pulseMinutes: command.pulseMinutes,
          foldLbsPerFolderMinute: command.foldLbsPerFolderMinute,
          algorithmVersion: 'fixed-pulse-ffd-v2' as const,
          version: await repo.nextSchedulerConfigVersion(command.locationId),
          stageFitAssertion: {
            ...command.stageFitAssertion,
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

        return result.ok(config);
      });
    } catch (error) {
      return result.err(
        mapUnknownError(error, (unknownCause) =>
          databaseError({
            code: 'scheduler_config_publish_failed',
            message: 'The scheduler configuration could not be published.',
            safeMessage: 'The scheduler configuration could not be published.',
            status: 503,
            cause: unknownCause,
          }),
        ),
      );
    }
  };
