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

export type SchedulerConfig = Readonly<{
  id: string;
  pulseMinutes: number;
  foldLbsPerFolderMinute: number;
  algorithmVersion: 'fixed-pulse-ffd-v1' | 'fixed-pulse-ffd-v2';
  version: number;
  stageFitAssertion: Readonly<{
    sortingFits: true;
    washingFits: true;
    dryingFits: true;
    assertedBy: string;
    assertedAt: string;
  }>;
  publishedAt: string;
}>;

export type PublishSchedulerConfigValidationFailure = Readonly<{
  kind: 'validation';
  classification: 'semantic';
  code: 'scheduler_config_invalid';
  message: 'Scheduler values must be positive.';
  safeMessage: 'Scheduler values must be positive.';
}>;

export type PublishSchedulerConfigConflictFailure = Readonly<{
  kind: 'conflict';
  code: 'production_idempotency_conflict';
  message: 'The idempotency key belongs to a different production command.';
  safeMessage: 'The idempotency key belongs to a different production command.';
}>;

export type PublishSchedulerConfigExpectedFailure =
  | PublishSchedulerConfigValidationFailure
  | PublishSchedulerConfigConflictFailure;

export type PublishSchedulerConfigDecision =
  | Readonly<{
      kind: 'reject';
      failure: PublishSchedulerConfigValidationFailure;
    }>
  | Readonly<{
      kind: 'publish';
      config: Readonly<{
        pulseMinutes: number;
        foldLbsPerFolderMinute: number;
        algorithmVersion: 'fixed-pulse-ffd-v2';
        stageFitAssertion: PublishSchedulerConfigCommand['stageFitAssertion'];
      }>;
    }>;
