import { describe, expect, it } from 'vitest';
import {
  toProductionBatchProgressReconciliationResult,
  toReconcileProductionBatchProgressCommand,
} from '../../../../src/features/floor/reconcile-batch-progress/reconcile-production-batch-progress.contract.mapper.ts';

const scope = {
  locationId: 'location-1',
  productionRunId: '11111111-1111-4111-8111-111111111111',
  productionBatchId: '22222222-2222-4222-8222-222222222222',
  actorId: '33333333-3333-4333-8333-333333333333',
} as const;

const stageVersions = [
  {
    stageRunId: '44444444-4444-4444-8444-444444444441',
    version: 1,
  },
  {
    stageRunId: '44444444-4444-4444-8444-444444444442',
    version: 1,
  },
  {
    stageRunId: '44444444-4444-4444-8444-444444444443',
    version: 1,
  },
  {
    stageRunId: '44444444-4444-4444-8444-444444444444',
    version: 1,
  },
] as const;

describe('reconcile Production batch progress mapper', () => {
  it('combines validated input with route and actor scope', () => {
    expect(
      toReconcileProductionBatchProgressCommand(
        {
          expectedQueueVersion: 3,
          expectedBatchVersion: 2,
          expectedStageVersions: [...stageVersions],
          target: 'washing_started',
          reason: 'lpms_unavailable',
          machineIds: ['55555555-5555-4555-8555-555555555555'],
          idempotencyKey: 'reconcile-progress-1',
        },
        scope,
      ),
    ).toEqual({
      ...scope,
      expectedQueueVersion: 3,
      expectedBatchVersion: 2,
      expectedStageVersions: stageVersions,
      target: 'washing_started',
      reason: 'lpms_unavailable',
      note: null,
      machineIds: ['55555555-5555-4555-8555-555555555555'],
      confirmation: null,
      idempotencyKey: 'reconcile-progress-1',
    });
  });

  it('presents a confirmation proposal at the wire boundary', () => {
    expect(
      toProductionBatchProgressReconciliationResult({
        status: 'confirmation_required',
        productionRunId: scope.productionRunId,
        productionBatchId: scope.productionBatchId,
        currentMilestone: 'waiting_to_sort',
        targetMilestone: 'washing_started',
        queueVersion: 3,
        batchVersion: 2,
        stageVersions,
        confirmation: { proposalHash: 'a'.repeat(64) },
        effects: {
          completedStages: ['sorting'],
          activeStage: 'washing',
          finishesBatch: false,
          finishesRun: false,
          closesShift: false,
        },
        replayed: false,
      }),
    ).toEqual({
      status: 'confirmation_required',
      productionRunId: scope.productionRunId,
      productionBatchId: scope.productionBatchId,
      currentMilestone: 'waiting_to_sort',
      targetMilestone: 'washing_started',
      queueVersion: 3,
      batchVersion: 2,
      stageVersions,
      confirmation: { proposalHash: 'a'.repeat(64) },
      effects: {
        completedStages: ['sorting'],
        activeStage: 'washing',
        finishesBatch: false,
        finishesRun: false,
        closesShift: false,
      },
      replayed: false,
    });
  });

  it('presents a reconciled outcome at the wire boundary', () => {
    const result = {
      status: 'reconciled' as const,
      productionRunId: scope.productionRunId,
      productionBatchId: scope.productionBatchId,
      milestone: 'washing_started' as const,
      queueVersion: 4,
      batchVersion: 3,
      stageVersions,
      finishedOrderCount: 0,
      finishedBagCount: 0,
      runCompleted: false,
      shiftClosed: false,
      replayed: false,
    };

    expect(toProductionBatchProgressReconciliationResult(result)).toEqual(
      result,
    );
  });
});
