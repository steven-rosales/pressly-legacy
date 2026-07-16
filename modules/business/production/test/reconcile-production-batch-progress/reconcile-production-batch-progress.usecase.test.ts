import { describe, expect, it, vi } from 'vitest';
import type {
  ProductionBatchProgressReconciledResult,
  ProductionBatchProgressReconciliationConfirmationRequiredResult,
} from '@pressly/contracts';
import type {
  StoredWorkEvent,
  WorkEventInput,
} from '../../src/production.port.ts';
import type {
  ReconcileProductionBatchProgressRepository,
  ReconciliationContext,
} from '../../src/reconcile-production-batch-progress/reconcile-production-batch-progress.port.ts';
import { makeReconcileProductionBatchProgress } from '../../src/reconcile-production-batch-progress/reconcile-production-batch-progress.usecase.ts';
import { allowPolicy } from '../support/production.fake.ts';

const ids = {
  run: '11111111-1111-4111-8111-111111111111',
  batch: '22222222-2222-4222-8222-222222222222',
  actor: '33333333-3333-4333-8333-333333333333',
  dryer: '44444444-4444-4444-8444-444444444444',
  stages: [
    '55555555-5555-4555-8555-555555555551',
    '55555555-5555-4555-8555-555555555552',
    '55555555-5555-4555-8555-555555555553',
    '55555555-5555-4555-8555-555555555554',
  ],
} as const;

const context = (batchVersion = 3): ReconciliationContext => ({
  run: {
    id: ids.run,
    status: 'started',
    queueVersion: 5,
    productionShiftId: '66666666-6666-4666-8666-666666666666',
  },
  batch: {
    id: ids.batch,
    status: 'queued',
    version: batchVersion,
    derivedWeightLbs: 50,
    membershipFrozen: false,
  },
  stages: (['sorting', 'washing', 'drying', 'folding_packaging'] as const).map(
    (stage, index) => ({
      stageRunId: ids.stages[index]!,
      stage,
      status: 'planned' as const,
      plannedStartAt: `2026-07-15T1${index}:00:00.000Z`,
      plannedEndAt: `2026-07-15T1${index}:56:00.000Z`,
      actualStartAt: null,
      actualEndAt: null,
      actualStartProvenance: 'not_recorded' as const,
      actualEndProvenance: 'not_recorded' as const,
      version: 1,
    }),
  ),
  activeStageKinds: [],
  machines: [
    {
      id: ids.dryer,
      stationKind: 'drying',
      effectiveCapacityLbs: 80,
      active: true,
      overlaps: false,
    },
  ],
  otherBatchStatuses: ['finished'],
  otherRunStatuses: [],
});

const committed: ProductionBatchProgressReconciledResult = {
  status: 'reconciled',
  productionRunId: ids.run,
  productionBatchId: ids.batch,
  milestone: 'drying_started',
  queueVersion: 6,
  batchVersion: 4,
  stageVersions: ids.stages.map((stageRunId) => ({
    stageRunId,
    version: 2,
  })),
  finishedOrderCount: 0,
  finishedBagCount: 0,
  runCompleted: false,
  shiftClosed: false,
  replayed: false,
};

const makeRepository = (
  initial = context(),
  options: Readonly<{
    storedWorkEvent?: StoredWorkEvent | null;
    replayAfterLock?: boolean;
  }> = {},
) => {
  let stored: StoredWorkEvent | null = options.storedWorkEvent ?? null;
  let workEventReads = 0;
  const reconcile = vi.fn(async () => committed);
  const appendWorkEvent = vi.fn(async (event: WorkEventInput) => {
    stored = {
      command: event.idempotency.command,
      result: event.idempotency.result,
      valid: true,
    };
  });
  const findWorkEvent = vi.fn(async () => {
    workEventReads += 1;
    if (options.replayAfterLock === true && workEventReads === 1) return null;
    return stored;
  });
  const loadContext = vi.fn(async () => initial);
  const operations = {
    findWorkEvent,
    loadContext,
    reconcile,
    appendWorkEvent,
  };
  const repo: ReconcileProductionBatchProgressRepository = {
    transaction: async (work) => work(operations),
  };
  return {
    repo,
    findWorkEvent,
    loadContext,
    reconcile,
    appendWorkEvent,
  };
};

const command = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionBatchId: ids.batch,
  expectedQueueVersion: 5,
  expectedBatchVersion: 3,
  expectedStageVersions: ids.stages.map((stageRunId) => ({
    stageRunId,
    version: 1,
  })),
  target: 'drying_started' as const,
  reason: 'lpms_unavailable' as const,
  machineIds: [ids.dryer],
  actorId: ids.actor,
  idempotencyKey: 'reconcile-batch-progress-1',
};

const confirmationValue = (
  value: unknown,
): ProductionBatchProgressReconciliationConfirmationRequiredResult => {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('status' in value) ||
    value.status !== 'confirmation_required'
  )
    throw new Error('Expected floor-progress confirmation.');
  return value as ProductionBatchProgressReconciliationConfirmationRequiredResult;
};

describe('reconcile production batch progress', () => {
  it('previews exact effects, then commits one atomic auditable reconciliation', async () => {
    const repository = makeRepository();
    const reconcile = makeReconcileProductionBatchProgress({
      repo: repository.repo,
      policy: allowPolicy,
      clock: { now: () => new Date('2026-07-15T14:00:00.000Z') },
    });

    const preview = await reconcile(command);
    expect(preview).toMatchObject({
      tag: 'ok',
      value: {
        status: 'confirmation_required',
        currentMilestone: 'waiting_to_sort',
        targetMilestone: 'drying_started',
        effects: {
          completedStages: ['sorting', 'washing'],
          activeStage: 'drying',
          finishesBatch: false,
        },
      },
    });
    if (preview.tag === 'err') return;
    const required = confirmationValue(preview.value);
    expect(repository.reconcile).not.toHaveBeenCalled();
    expect(repository.appendWorkEvent).not.toHaveBeenCalled();

    await expect(
      reconcile({ ...command, confirmation: required.confirmation }),
    ).resolves.toEqual({ tag: 'ok', value: committed });
    expect(repository.reconcile).toHaveBeenCalledOnce();
    expect(repository.appendWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'batch_progress_reconciled',
        entityType: 'production_batch',
        entityId: ids.batch,
        payload: expect.objectContaining({
          reason: 'lpms_unavailable',
          currentMilestone: 'waiting_to_sort',
          targetMilestone: 'drying_started',
          confirmation: {
            proposalHash: required.confirmation.proposalHash,
            reviewedEffects: required.effects,
          },
          stageBoundaries: expect.arrayContaining([
            expect.objectContaining({
              stage: 'sorting',
              status: 'completed',
              actualStartProvenance: 'not_recorded',
              actualEndProvenance: 'not_recorded',
            }),
          ]),
        }),
        idempotency: expect.objectContaining({
          command: expect.objectContaining({
            payload: expect.objectContaining({
              confirmation: required.confirmation,
            }),
          }),
        }),
      }),
    );

    await expect(
      reconcile({ ...command, confirmation: required.confirmation }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { status: 'reconciled', replayed: true },
    });
    expect(repository.reconcile).toHaveBeenCalledOnce();

    await expect(
      reconcile({
        ...command,
        confirmation: { proposalHash: 'f'.repeat(64) },
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict', status: 409 },
    });
  });

  it('replays an identical confirmation that commits while the aggregate lock is being acquired', async () => {
    const source = makeRepository();
    const sourceUseCase = makeReconcileProductionBatchProgress({
      repo: source.repo,
      policy: allowPolicy,
      clock: { now: () => new Date('2026-07-15T14:00:00.000Z') },
    });
    const preview = await sourceUseCase(command);
    if (preview.tag === 'err') return;
    const required = confirmationValue(preview.value);
    await sourceUseCase({ ...command, confirmation: required.confirmation });
    const appended = source.appendWorkEvent.mock.calls[0]?.[0];
    if (appended === undefined)
      throw new Error('Expected a reconciliation event.');

    const stored: StoredWorkEvent = {
      valid: true,
      command: appended.idempotency.command,
      result: appended.idempotency.result,
    };
    const concurrent = makeRepository(context(4), {
      storedWorkEvent: stored,
      replayAfterLock: true,
    });
    const concurrentUseCase = makeReconcileProductionBatchProgress({
      repo: concurrent.repo,
      policy: allowPolicy,
      clock: { now: () => new Date('2026-07-15T14:01:00.000Z') },
    });

    await expect(
      concurrentUseCase({
        ...command,
        confirmation: required.confirmation,
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { status: 'reconciled', replayed: true },
    });
    expect(concurrent.findWorkEvent).toHaveBeenCalledTimes(2);
    expect(concurrent.loadContext).toHaveBeenCalledOnce();
    expect(concurrent.reconcile).not.toHaveBeenCalled();
  });

  it('rejects stale aggregate and confirmation versions before mutation', async () => {
    const source = makeRepository();
    const sourceUseCase = makeReconcileProductionBatchProgress({
      repo: source.repo,
      policy: allowPolicy,
      clock: { now: () => new Date('2026-07-15T14:00:00.000Z') },
    });
    const preview = await sourceUseCase(command);
    if (preview.tag === 'err') return;
    const required = confirmationValue(preview.value);

    const changed = makeRepository(context(4));
    const changedUseCase = makeReconcileProductionBatchProgress({
      repo: changed.repo,
      policy: allowPolicy,
      clock: { now: () => new Date('2026-07-15T14:01:00.000Z') },
    });
    await expect(
      changedUseCase({ ...command, confirmation: required.confirmation }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_batch_version_conflict', status: 409 },
    });
    expect(changed.reconcile).not.toHaveBeenCalled();
  });
});
