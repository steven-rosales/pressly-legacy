import type {
  PublishSchedulerConfigCommand,
  SchedulerConfig,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  Transactional,
  WorkEventInput,
} from '../production.port.ts';

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
