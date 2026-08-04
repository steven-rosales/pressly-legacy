import {
  validationFailure,
  isProductionFeatureFailure,
} from '../../../foundations/language/failures/production-failure.factory.ts';
import { databaseError } from '@pressly/errors/factories';
import { mapUnknownError } from '@pressly/errors/app-error';
import { result } from '@pressly/kernel';
import type { IdSource } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { productionIdempotencyConflict } from '../../../foundations/language/commands/production-command.failure.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../../../foundations/language/commands/production-idempotency.policy.ts';
import type { SchedulerConfig } from '../../../foundations/language/scheduling/scheduler-config.model.ts';
import type {
  PublishSchedulerConfig,
  PublishSchedulerConfigRepository,
} from './publish-scheduler-config.port.ts';
export type { PublishSchedulerConfig } from './publish-scheduler-config.port.ts';

export const makePublishSchedulerConfig =
  (deps: {
    repo: PublishSchedulerConfigRepository;
    clock: Clock;
    ids: IdSource;
  }): PublishSchedulerConfig =>
  async (command) => {
    if (command.pulseMinutes <= 0 || command.foldLbsPerFolderMinute <= 0)
      return result.err(
        validationFailure({
          code: 'scheduler_config_invalid',
          message: 'Scheduler values must be positive.',
          safeMessage: 'Scheduler values must be positive.',
          classification: 'semantic',
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
      if (isProductionFeatureFailure(error)) return result.err(error);
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'scheduler_config_publish_failed',
          message: 'The scheduler configuration could not be published.',
          safeMessage: 'The scheduler configuration could not be published.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
