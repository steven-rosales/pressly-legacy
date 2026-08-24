import type { AdvanceStageCommand } from '@pressly/production-system/operations/floor/advance-stage/types';
import type {
  CanonicalValue,
  CommandObservation,
} from './command-observation.ts';

export type AdvanceStageCanonicalValue =
  | Readonly<{
      kind: 'mutation';
      entityId: string;
      version: number;
      replayed: boolean;
    }>
  | Readonly<{
      kind: 'confirmation-required';
      code: string;
      stageRunId: string;
      stageVersion: number;
      message: string;
      confirmation: CanonicalValue;
      timing: CanonicalValue;
      replayed: false;
    }>;

export type AdvanceStageCanonicalFailure = Readonly<{
  code: string;
  kind: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type AdvanceStageCanonicalOutcome =
  | Readonly<{ kind: 'success'; value: AdvanceStageCanonicalValue }>
  | Readonly<{ kind: 'failure'; failure: AdvanceStageCanonicalFailure }>
  | Readonly<{ kind: 'unexpected'; error: AdvanceStageCanonicalFailure }>;

export type AdvanceStageExecutionMode = 'sequential' | 'concurrent';

export type AdvanceStageSignal = Readonly<{
  signal: 'batchFrozen';
  source: 'stage_start';
  afterCommit: boolean;
  committedMutationOrdinal: number;
}>;

export type AdvanceStageSignalPort = Readonly<{
  batchFrozen: (input: Readonly<{ source: 'stage_start' }>) => void;
}>;

export type AdvanceStageState = Readonly<{
  stage: Readonly<{
    id: string;
    status: string;
    version: number;
    actualStartAt: string | null;
    actualEndAt: string | null;
    actualStartProvenance: string;
    actualEndProvenance: string;
    startedBy: string | null;
    completedBy: string | null;
  }> | null;
  batch: Readonly<{
    id: string;
    status: string;
    version: number;
    startedAt: string | null;
    finishedAt: string | null;
    membershipFrozenAt: string | null;
    membershipFrozenBy: string | null;
  }> | null;
  run: Readonly<{
    id: string;
    status: string;
    queueVersion: number;
    version: number;
  }> | null;
  assignments: readonly Readonly<{
    id: string;
    status: string;
    actualStartAt: string | null;
    actualEndAt: string | null;
  }>[];
}>;

export type AdvanceStageAuditEvent = Readonly<{
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId: string;
  expectedVersion: number | null;
  idempotencyKey: string;
  payload: CanonicalValue;
}>;

export type AdvanceStageObservation = CommandObservation<
  readonly AdvanceStageCanonicalOutcome[],
  AdvanceStageState,
  AdvanceStageAuditEvent,
  CanonicalValue,
  AdvanceStageSignal
> &
  Readonly<{
    execution: Readonly<{
      mode: AdvanceStageExecutionMode;
      initialIdempotencyMisses: number;
    }>;
  }>;

export type AdvanceStageScenario = Readonly<{
  name: string;
  executionMode: AdvanceStageExecutionMode;
  fixture: Readonly<{
    target: 'sorting' | 'washing';
    washingAssignmentStatus?: 'active' | 'planned';
  }>;
  now: Date;
  commands: readonly AdvanceStageCommand[];
}>;

export type AdvanceStageRunner = (
  commands: readonly AdvanceStageCommand[],
  executionMode: AdvanceStageExecutionMode,
) => Promise<readonly AdvanceStageCanonicalOutcome[]>;
