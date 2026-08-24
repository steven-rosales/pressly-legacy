import { proveOperation } from '@pressly/testkit/operation-proof';
import { reconcileBatchProgressCellDeclaration } from './cell.ts';
import { productionRules } from '../../../model/public.ts';
import { describe, expect, it, vi } from 'vitest';
import { makeExecuteReconcileBatchProgress } from './execute.ts';
import { reconcileBatchProgressIdempotency } from './idempotency.ts';
import type {
  ReconcileBatchProgressCommand,
  ReconciliationContext,
} from './types.ts';

const stageIds = [
  '10000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000012',
  '10000000-0000-4000-8000-000000000013',
  '10000000-0000-4000-8000-000000000014',
] as const;
const context: ReconciliationContext = {
  run: {
    id: '10000000-0000-4000-8000-000000000001',
    status: 'started',
    queueVersion: 1,
    productionShiftId: 'shift-1',
    productionShiftStatus: 'open',
  },
  batch: {
    id: '10000000-0000-4000-8000-000000000002',
    status: 'queued',
    version: 1,
    derivedWeightLbs: 40,
    membershipFrozen: false,
  },
  stages: (['sorting', 'washing', 'drying', 'folding_packaging'] as const).map(
    (stage, index) => ({
      stageRunId: stageIds[index]!,
      stage,
      status: 'planned' as const,
      plannedStartAt: new Date(`2026-08-21T${14 + index}:00:00.000Z`),
      plannedEndAt: new Date(`2026-08-21T${15 + index}:00:00.000Z`),
      actualStartAt: null,
      actualEndAt: null,
      actualStartProvenance: 'not_recorded' as const,
      actualEndProvenance: 'not_recorded' as const,
      version: 1,
    }),
  ),
  attempts: [],
  activeOrders: [],
  activeStageKinds: [],
  machines: [],
  otherBatchStatuses: [],
  otherRunStatuses: [],
};
const command: ReconcileBatchProgressCommand = {
  locationId: 'location-1',
  productionRunId: context.run.id,
  productionBatchId: context.batch.id,
  expectedQueueVersion: 1,
  expectedBatchVersion: 1,
  expectedStageVersions: stageIds.map((stageRunId) => ({
    stageRunId,
    version: 1,
  })),
  target: 'sorting_started',
  reason: 'updates_missed',
  note: null,
  machineIds: [],
  confirmation: null,
  idempotencyKey: 'reconcile-1',
  actorId: '10000000-0000-4000-8000-000000000003',
};

describe('reconcile batch progress executor', () => {
  proveOperation({
    operationId: 'production.reconcile-batch-progress.v1',
    declaration: reconcileBatchProgressCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'previews without mutation or a durable receipt',
        proves: ['executor-success'],
        run: async () => {
          const reconcile = vi.fn();
          const append = vi.fn();
          const clock = vi.fn(() => new Date('2026-08-21T15:00:00.000Z'));
          const execute = makeExecuteReconcileBatchProgress({
            repo: {
              transaction: async (work) =>
                work({
                  findWorkEvent: async () => null,
                  loadContext: async () => context,
                  reconcile,
                  appendWorkEvent: append,
                }),
            },
            idempotency: reconcileBatchProgressIdempotency,
            policy: productionRules,
            clock: { now: clock },
          });
          const outcome = await execute(command);
          expect(outcome).toMatchObject({
            kind: 'success',
            value: { status: 'confirmation_required' },
          });
          expect(reconcile).not.toHaveBeenCalled();
          expect(append).not.toHaveBeenCalled();
          expect(clock).not.toHaveBeenCalled();
        },
      },
    ],
  });

  it('commits and signals only after exact confirmation', async () => {
    const previewExecute = makeExecuteReconcileBatchProgress({
      repo: {
        transaction: async (work) =>
          work({
            findWorkEvent: async () => null,
            loadContext: async () => context,
            reconcile: vi.fn(),
            appendWorkEvent: vi.fn(),
          }),
      },
      idempotency: reconcileBatchProgressIdempotency,
      policy: productionRules,
      clock: { now: () => new Date() },
    });
    const preview = await previewExecute(command);
    if (
      preview.kind !== 'success' ||
      preview.value.status !== 'confirmation_required'
    )
      return;

    const result = {
      status: 'reconciled' as const,
      productionRunId: context.run.id,
      productionBatchId: context.batch.id,
      milestone: 'sorting_started' as const,
      queueVersion: 2,
      batchVersion: 2,
      stageVersions: stageIds.map((stageRunId, index) => ({
        stageRunId,
        version: index === 0 ? 2 : 1,
      })),
      finishedOrderCount: 0,
      finishedBagCount: 0,
      runCompleted: false,
      shiftClosed: false,
      replayed: false,
    };
    const append = vi.fn(async (_event: unknown) => undefined);
    const progressReconciled = vi.fn();
    const execute = makeExecuteReconcileBatchProgress({
      repo: {
        transaction: async (work) =>
          work({
            findWorkEvent: async () => null,
            loadContext: async () => context,
            reconcile: async () => ({ kind: 'success', value: result }),
            appendWorkEvent: append,
          }),
      },
      idempotency: reconcileBatchProgressIdempotency,
      policy: productionRules,
      clock: { now: () => new Date('2026-08-21T15:00:00.000Z') },
      signals: { progressReconciled },
    });
    await expect(
      execute({ ...command, confirmation: preview.value.confirmation }),
    ).resolves.toEqual({ kind: 'success', value: result });
    expect(append).toHaveBeenCalledOnce();
    expect(progressReconciled).toHaveBeenCalledWith({
      target: 'sorting_started',
      runCompleted: false,
    });
  });
});
