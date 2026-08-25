import { bindCell, declareCommandCell } from '@pressly/cells';
import { reconcileBatchProgressContract } from './contract.ts';
import { reconcileBatchProgressOperationId } from './decide.ts';
import {
  makeExecuteReconcileBatchProgress,
  type ReconcileBatchProgressDependencies,
} from './execute.ts';
import { reconcileBatchProgressHttpSurfaces } from './http.ts';
import type {
  ReconcileBatchProgressCommand,
  ReconcileBatchProgressExpectedFailure,
  ReconcileBatchProgressResult,
} from './types.ts';

export const reconcileBatchProgressCellDeclaration = declareCommandCell<
  ReconcileBatchProgressCommand,
  ReconcileBatchProgressResult,
  ReconcileBatchProgressExpectedFailure
>({
  id: reconcileBatchProgressOperationId,
  contract: reconcileBatchProgressContract,
  authorization: {
    capability: 'production:stage',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    expectedVersion: (input) =>
      [
        input.expectedQueueVersion,
        input.expectedBatchVersion,
        ...input.expectedStageVersions
          .map((stage) => `${stage.stageRunId}:${stage.version}`)
          .sort(),
        input.confirmation?.proposalHash ?? 'preview',
      ].join('|'),
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: reconcileBatchProgressHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.reconcile_batch_progress' },
});

export const makeReconcileBatchProgressCell = <Stored>(
  deps: ReconcileBatchProgressDependencies<Stored>,
) =>
  bindCell(
    reconcileBatchProgressCellDeclaration,
    makeExecuteReconcileBatchProgress(deps),
  );
