import type {
  PublishSchedulerConfigCommand,
  SchedulerConfig,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../command-execution/production-command.port.ts';
import type { Transactional } from '../persistence/production-transaction.port.ts';

export type PublishSchedulerConfig = (
  command: PublishSchedulerConfigCommand & {
    locationId: string;
    actorId: string;
    idempotencyKey: string;
  },
) => Promise<Result<SchedulerConfig, AppError>>;

export type PublishSchedulerConfigRepository = Transactional<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    nextSchedulerConfigVersion: (locationId: string) => Promise<number>;
    saveSchedulerConfig: (
      locationId: string,
      config: SchedulerConfig,
    ) => Promise<SchedulerConfig>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
