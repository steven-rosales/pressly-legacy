import type { PublishSchedulerConfigFailure } from './publish-scheduler-config.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../../../foundations/language/commands/production-command.model.ts';
import type { UnitOfWork } from '@pressly/kernel';
import type { SchedulerConfig } from '../../../foundations/language/scheduling/scheduler-config.model.ts';

export type PublishSchedulerConfigCommand = Readonly<{
  locationId: string;
  actorId: string;
  pulseMinutes: number;
  foldLbsPerFolderMinute: number;
  stageFitAssertion: Readonly<{
    sortingFits: true;
    washingFits: true;
    dryingFits: true;
  }>;
  idempotencyKey: string;
}>;

export type PublishSchedulerConfig = (
  command: PublishSchedulerConfigCommand,
) => Promise<Result<SchedulerConfig, PublishSchedulerConfigFailure>>;

export type PublishSchedulerConfigRepository = UnitOfWork<
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
