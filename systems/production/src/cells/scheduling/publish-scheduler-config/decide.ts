import { schedulerConfigInvalid } from './failures.ts';
import type {
  PublishSchedulerConfigCommand,
  PublishSchedulerConfigDecision,
} from './types.ts';

export const publishSchedulerConfigOperationId =
  'production.publish-scheduler-config.v1' as const;

export const decidePublishSchedulerConfig = (
  command: PublishSchedulerConfigCommand,
): PublishSchedulerConfigDecision => {
  if (command.pulseMinutes <= 0 || command.foldLbsPerFolderMinute <= 0)
    return { kind: 'reject', failure: schedulerConfigInvalid() };

  return {
    kind: 'publish',
    config: {
      pulseMinutes: command.pulseMinutes,
      foldLbsPerFolderMinute: command.foldLbsPerFolderMinute,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      stageFitAssertion: command.stageFitAssertion,
    },
  };
};
