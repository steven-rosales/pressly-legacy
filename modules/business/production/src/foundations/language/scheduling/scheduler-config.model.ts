export type SchedulerAlgorithmVersion =
  | 'fixed-pulse-ffd-v1'
  | 'fixed-pulse-ffd-v2';

export type SchedulerStageFitAssertion = Readonly<{
  sortingFits: true;
  washingFits: true;
  dryingFits: true;
  assertedBy: string;
  assertedAt: string;
}>;

export type SchedulerConfig = Readonly<{
  id: string;
  pulseMinutes: number;
  foldLbsPerFolderMinute: number;
  algorithmVersion: SchedulerAlgorithmVersion;
  version: number;
  stageFitAssertion: SchedulerStageFitAssertion;
  publishedAt: string;
}>;
