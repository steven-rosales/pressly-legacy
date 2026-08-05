import type { SchedulerConfig as SchedulerConfigResult } from '@pressly/contracts/production';
import type { SchedulerConfig } from '../../../foundations/language/scheduling/scheduler-config.model.ts';

export const toSchedulerConfigResult = (
  config: SchedulerConfig,
): SchedulerConfigResult => ({
  id: config.id,
  pulseMinutes: config.pulseMinutes,
  foldLbsPerFolderMinute: config.foldLbsPerFolderMinute,
  algorithmVersion: config.algorithmVersion,
  version: config.version,
  stageFitAssertion: {
    sortingFits: config.stageFitAssertion.sortingFits,
    washingFits: config.stageFitAssertion.washingFits,
    dryingFits: config.stageFitAssertion.dryingFits,
    assertedBy: config.stageFitAssertion.assertedBy,
    assertedAt: config.stageFitAssertion.assertedAt,
  },
  publishedAt: config.publishedAt,
});
