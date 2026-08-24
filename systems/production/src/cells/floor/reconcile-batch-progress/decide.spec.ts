import { proveOperation } from '@pressly/testkit/operation-proof';
import { reconcileBatchProgressCellDeclaration } from './cell.ts';
import { productionRules } from '../../../model/public.ts';
import { describe, expect, it } from 'vitest';
import { decideReconcileBatchProgress } from './decide.ts';
import type {
  ReconcileBatchProgressCommand,
  ReconciliationContext,
} from './types.ts';

const ids = {
  run: '10000000-0000-4000-8000-000000000001',
  batch: '10000000-0000-4000-8000-000000000002',
  actor: '10000000-0000-4000-8000-000000000003',
  stages: [
    '10000000-0000-4000-8000-000000000011',
    '10000000-0000-4000-8000-000000000012',
    '10000000-0000-4000-8000-000000000013',
    '10000000-0000-4000-8000-000000000014',
  ],
} as const;
const kinds = ['sorting', 'washing', 'drying', 'folding_packaging'] as const;
const context: ReconciliationContext = {
  run: {
    id: ids.run,
    status: 'started',
    queueVersion: 1,
    productionShiftId: 'shift-1',
    productionShiftStatus: 'open',
  },
  batch: {
    id: ids.batch,
    status: 'queued',
    version: 1,
    derivedWeightLbs: 40,
    membershipFrozen: false,
  },
  stages: kinds.map((stage, index) => ({
    stageRunId: ids.stages[index]!,
    stage,
    status: 'planned' as const,
    plannedStartAt: new Date(
      `2026-08-21T${String(14 + index).padStart(2, '0')}:00:00.000Z`,
    ),
    plannedEndAt: new Date(
      `2026-08-21T${String(15 + index).padStart(2, '0')}:00:00.000Z`,
    ),
    actualStartAt: null,
    actualEndAt: null,
    actualStartProvenance: 'not_recorded' as const,
    actualEndProvenance: 'not_recorded' as const,
    version: 1,
  })),
  attempts: [],
  activeOrders: [],
  activeStageKinds: [],
  machines: [],
  otherBatchStatuses: [],
  otherRunStatuses: [],
};
const command: ReconcileBatchProgressCommand = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionBatchId: ids.batch,
  expectedQueueVersion: 1,
  expectedBatchVersion: 1,
  expectedStageVersions: ids.stages.map((stageRunId) => ({
    stageRunId,
    version: 1,
  })),
  target: 'sorting_started',
  reason: 'updates_missed',
  note: null,
  machineIds: [],
  confirmation: null,
  idempotencyKey: 'reconcile-1',
  actorId: ids.actor,
};

describe('reconcile batch progress decision', () => {
  proveOperation({
    operationId: 'production.reconcile-batch-progress.v1',
    declaration: reconcileBatchProgressCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'returns a deterministic confirmation preview then exact commit plan',
        proves: ['decision'],
        run: () => {
          const preview = decideReconcileBatchProgress({
            command,
            context,
            policy: productionRules,
            now: new Date(0),
          });
          expect(preview).toMatchObject({
            kind: 'preview',
            result: {
              status: 'confirmation_required',
              currentMilestone: 'waiting_to_sort',
              targetMilestone: 'sorting_started',
              effects: { activeStage: 'sorting' },
            },
          });
          if (preview.kind !== 'preview') return;
          const committed = decideReconcileBatchProgress({
            command: { ...command, confirmation: preview.result.confirmation },
            context,
            policy: productionRules,
            now: new Date('2026-08-21T15:00:00.000Z'),
          });
          expect(committed).toMatchObject({
            kind: 'commit',
            plan: {
              projection: { batchStatus: 'sorting', activeStage: 'sorting' },
              stageLifecycles: [
                {
                  stageRunId: ids.stages[0],
                  lifecycle: { from: 'planned', state: 'started' },
                },
              ],
              batchLifecycle: { from: 'queued', state: 'sorting' },
            },
          });
        },
      },
    ],
  });

  it('rejects version and confirmation drift', () => {
    expect(
      decideReconcileBatchProgress({
        command: { ...command, expectedQueueVersion: 2 },
        context,
        policy: productionRules,
        now: new Date(0),
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_queue_version_conflict' },
    });
    expect(
      decideReconcileBatchProgress({
        command: { ...command, confirmation: { proposalHash: 'x'.repeat(64) } },
        context,
        policy: productionRules,
        now: new Date('2026-08-21T15:00:00.000Z'),
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'progress_reconciliation_confirmation_stale' },
    });
  });

  it('compiles exact machine and terminal lifecycle plans', () => {
    const washingContext: ReconciliationContext = {
      ...context,
      batch: { ...context.batch, status: 'sorting' },
      stages: context.stages.map((stage, index) => ({
        ...stage,
        status: index === 0 ? ('completed' as const) : ('planned' as const),
      })),
      machines: [
        {
          id: '10000000-0000-4000-8000-000000000020',
          stationKind: 'washing',
          effectiveCapacityLbs: 50,
          active: true,
          overlaps: false,
        },
      ],
    };
    const washingCommand: ReconcileBatchProgressCommand = {
      ...command,
      target: 'washing_started',
      machineIds: [washingContext.machines[0]!.id],
    };
    const washingPreview = decideReconcileBatchProgress({
      command: washingCommand,
      context: washingContext,
      policy: productionRules,
      now: new Date(0),
    });
    if (washingPreview.kind !== 'preview') return;
    expect(
      decideReconcileBatchProgress({
        command: {
          ...washingCommand,
          confirmation: washingPreview.result.confirmation,
        },
        context: washingContext,
        policy: productionRules,
        now: new Date('2026-08-21T15:00:00.000Z'),
      }),
    ).toMatchObject({
      kind: 'commit',
      plan: {
        machineIds: [washingContext.machines[0]!.id],
        projection: { activeStage: 'washing', batchStatus: 'washing' },
      },
    });

    const finalContext: ReconciliationContext = {
      ...context,
      batch: {
        ...context.batch,
        status: 'folding_packaging',
        membershipFrozen: true,
      },
      stages: context.stages.map((stage, index) => ({
        ...stage,
        status: index < 3 ? ('completed' as const) : ('started' as const),
        actualStartAt:
          index === 3 ? new Date('2026-08-21T17:00:00.000Z') : null,
      })),
      attempts: [
        {
          id: '10000000-0000-4000-8000-000000000030',
          stageRunId: ids.stages[3],
          status: 'assigned',
        },
      ],
      activeOrders: [
        {
          id: '10000000-0000-4000-8000-000000000031',
          status: 'scheduled',
          executionStatus: 'scheduled',
          resolutionState: 'open',
          version: 2,
        },
      ],
    };
    const finalCommand: ReconcileBatchProgressCommand = {
      ...command,
      target: 'finished',
    };
    const finalPreview = decideReconcileBatchProgress({
      command: finalCommand,
      context: finalContext,
      policy: productionRules,
      now: new Date(0),
    });
    if (finalPreview.kind !== 'preview') return;
    expect(
      decideReconcileBatchProgress({
        command: {
          ...finalCommand,
          confirmation: finalPreview.result.confirmation,
        },
        context: finalContext,
        policy: productionRules,
        now: new Date('2026-08-21T18:00:00.000Z'),
      }),
    ).toMatchObject({
      kind: 'commit',
      plan: {
        projection: { batchStatus: 'finished', activeStage: null },
        attemptLifecycles: [
          {
            attemptId: finalContext.attempts[0]!.id,
            lifecycle: { from: 'assigned', state: 'completed' },
          },
        ],
        terminalLifecycle: {
          run: { from: 'started', state: 'completed' },
          shift: { from: 'open', state: 'closed' },
          orders: [
            {
              productionOrderId: finalContext.activeOrders[0]!.id,
              lifecycle: { from: 'scheduled', state: 'finished' },
            },
          ],
        },
      },
    });
  });
});
