import type { PostgresDatabase } from '@pressly/postgres/client';
import type { IdSource } from '@pressly/cells/id-source';

export type AssignStageMachinesCommand = Readonly<{
  locationId: string;
  stageRunId: string;
  actorId: string;
  expectedVersion: number;
  idempotencyKey: string;
  machineIds: readonly string[];
}>;

export type BatchMembershipCommand = Readonly<{
  locationId: string;
  productionRunId: string;
  productionBatchId: string;
  expectedQueueVersion: number;
  expectedBatchVersion: number;
  idempotencyKey: string;
  actorId: string;
}>;

export type ReconcileBatchProgressCommand = Readonly<{
  locationId: string;
  productionRunId: string;
  productionBatchId: string;
  expectedQueueVersion: number;
  expectedBatchVersion: number;
  expectedStageVersions: readonly Readonly<{
    stageRunId: string;
    version: number;
  }>[];
  target:
    | 'sorting_started'
    | 'sorting_completed'
    | 'washing_started'
    | 'washing_completed'
    | 'drying_started'
    | 'drying_completed'
    | 'folding_packaging_started'
    | 'finished';
  reason: 'lpms_unavailable' | 'updates_missed' | 'other';
  note: string | null;
  machineIds: readonly string[];
  confirmation: Readonly<{ proposalHash: string }> | null;
  idempotencyKey: string;
  actorId: string;
}>;

export type FloorSignal =
  | Readonly<{ signal: 'batchFrozen'; source: 'explicit' }>
  | Readonly<{
      signal: 'queueConflict';
      operation: 'freeze_membership' | 'unfreeze_membership';
    }>
  | Readonly<{
      signal: 'progressReconciled';
      target: ReconcileBatchProgressCommand['target'];
      runCompleted: boolean;
    }>;

export type FloorSignalRecorder = Readonly<{
  signals: Readonly<{
    batchFrozen: (input: Readonly<{ source: 'explicit' }>) => void;
    queueConflict: (input: {
      operation: 'freeze_membership' | 'unfreeze_membership';
    }) => void;
    progressReconciled: (input: {
      target: ReconcileBatchProgressCommand['target'];
      runCompleted: boolean;
    }) => void;
  }>;
  read: () => readonly FloorSignal[];
}>;

export const makeFloorSignalRecorder = (): FloorSignalRecorder => {
  const recorded: FloorSignal[] = [];
  return Object.freeze({
    signals: Object.freeze({
      batchFrozen: (input: Readonly<{ source: 'explicit' }>) =>
        recorded.push({ signal: 'batchFrozen', source: input.source }),
      queueConflict: (input: {
        operation: 'freeze_membership' | 'unfreeze_membership';
      }) =>
        recorded.push({
          signal: 'queueConflict',
          operation: input.operation,
        }),
      progressReconciled: (input: {
        target: ReconcileBatchProgressCommand['target'];
        runCompleted: boolean;
      }) => recorded.push({ signal: 'progressReconciled', ...input }),
    }),
    read: () => Object.freeze([...recorded]),
  });
};

export type FloorRunners = Readonly<{
  assignStageMachines: (
    command: AssignStageMachinesCommand,
  ) => Promise<unknown>;
  freezeBatchMembership: (command: BatchMembershipCommand) => Promise<unknown>;
  unfreezeBatchMembership: (
    command: BatchMembershipCommand,
  ) => Promise<unknown>;
  reconcileBatchProgress: (
    command: ReconcileBatchProgressCommand,
  ) => Promise<unknown>;
}>;

export type MakeFloorRunnersInput = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  clock: Readonly<{ now: () => Date }>;
  signalRecorder: FloorSignalRecorder;
}>;
