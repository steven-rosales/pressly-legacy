import { proveOperation } from '@pressly/testkit/operation-proof';
import { previewOrderRouteCellDeclaration } from './cell.ts';
import {
  databaseError,
  invariantViolationError,
} from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import type {
  OrderRouteProposalCommand,
  OrderRouteProposalContext,
} from '../../../model/order-route-proposal/model.ts';
import { makeExecutePreviewOrderRoute } from './execute.ts';
import type {
  PreviewOrderRouteRepository,
  PreviewOrderRouteSignals,
} from './types.ts';

const ids = {
  run: '10000000-0000-4000-8000-000000000001',
  order: '10000000-0000-4000-8000-000000000002',
  source: '10000000-0000-4000-8000-000000000003',
  target: '10000000-0000-4000-8000-000000000004',
  membership: '10000000-0000-4000-8000-000000000005',
  actor: '10000000-0000-4000-8000-000000000006',
} as const;
const stages = ['sorting', 'washing', 'drying', 'folding_packaging'] as const;

const command: OrderRouteProposalCommand = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionOrderId: ids.order,
  actorId: ids.actor,
  authorizedAction: 'production:stage',
  kind: 'queued_move',
  reason: 'manual_rebatch',
  targetProductionBatchId: ids.target,
  restartStage: 'sorting',
  expectedQueueVersion: 4,
  expectedOrderVersion: 3,
  expectedSourceBatchVersion: 2,
};

const context = (): OrderRouteProposalContext => ({
  run: { id: ids.run, status: 'started', queueVersion: 4 },
  order: {
    id: ids.order,
    operationalStatus: 'scheduled',
    executionStatus: 'scheduled',
    resolutionState: 'open',
    version: 3,
    weightLbs: 25,
  },
  source: {
    membershipId: ids.membership,
    productionBatchId: ids.source,
    sequence: 0,
    status: 'queued',
    membershipFrozen: false,
    version: 2,
    derivedWeightLbs: 70,
    activeOrderCount: 2,
  },
  candidates: [
    {
      productionBatchId: ids.target,
      sequence: 1,
      status: 'queued',
      membershipFrozen: false,
      version: 5,
      derivedWeightLbs: 50,
      pulseCapacityLbs: 100,
      stages: stages.map((stage, index) => ({
        stageRunId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        stage,
        status: 'planned' as const,
        assignedWeightLbs: 50,
        capacityLbs: 100,
      })),
    },
  ],
  attempts: [],
});

const setup = (loaded: OrderRouteProposalContext | null = context()) => {
  const load = vi.fn<PreviewOrderRouteRepository['load']>(async () => loaded);
  const orderRouteOutcome =
    vi.fn<PreviewOrderRouteSignals['orderRouteOutcome']>();
  const queueConflict = vi.fn<PreviewOrderRouteSignals['queueConflict']>();
  const execute = makeExecutePreviewOrderRoute({
    repo: { load },
    policy: productionRules,
    signals: { orderRouteOutcome, queueConflict },
  });
  return { execute, load, orderRouteOutcome, queueConflict };
};

describe('execute preview order route', () => {
  proveOperation({
    operationId: 'production.preview-order-route.v1',
    declaration: previewOrderRouteCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'loads one snapshot, proposes without a write capability, and signals success',
        proves: ['decision', 'executor-success'],
        run: async () => {
          const harness = setup();

          await expect(harness.execute(command)).resolves.toMatchObject({
            kind: 'success',
            value: {
              productionOrderId: ids.order,
              sourceProductionBatchId: ids.source,
              targetProductionBatchId: ids.target,
            },
          });
          expect(harness.load).toHaveBeenCalledWith({
            locationId: 'location-1',
            productionRunId: ids.run,
            productionOrderId: ids.order,
          });
          expect(harness.orderRouteOutcome).toHaveBeenCalledWith({
            operation: 'preview',
            status: 'proposed',
            kind: 'queued_move',
            reason: 'manual_rebatch',
          });
          expect(harness.queueConflict).not.toHaveBeenCalled();
        },
      },
    ],
  });

  it('returns not found as typed data and reports a rejected preview', async () => {
    const harness = setup(null);

    await expect(harness.execute(command)).resolves.toEqual({
      kind: 'failure',
      failure: {
        kind: 'not_found',
        code: 'production_order_route_not_found',
        message: 'The production run, order, or current batch was not found.',
        safeMessage:
          'The production run, order, or current batch was not found.',
      },
    });
    expect(harness.orderRouteOutcome).toHaveBeenCalledWith({
      operation: 'preview',
      status: 'rejected',
      kind: 'queued_move',
      reason: 'manual_rebatch',
    });
  });

  it('reports the exact queue-conflict signal for a stale snapshot', async () => {
    const harness = setup();

    await expect(
      harness.execute({ ...command, expectedQueueVersion: 3 }),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: {
        kind: 'conflict',
        code: 'production_queue_version_conflict',
      },
    });
    expect(harness.orderRouteOutcome).toHaveBeenCalledWith({
      operation: 'preview',
      status: 'conflict',
      kind: 'queued_move',
      reason: 'manual_rebatch',
    });
    expect(harness.queueConflict).toHaveBeenCalledWith({
      operation: 'order_route_preview',
    });
  });

  it('reports failed when snapshot persistence raises an owned error', async () => {
    const harness = setup();
    const persistenceFailure = databaseError({
      code: 'route_snapshot_unavailable',
      message: 'Route snapshot unavailable.',
      safeMessage: 'Route snapshot unavailable.',
      status: 503,
    });
    harness.load.mockRejectedValueOnce(persistenceFailure);

    await expect(harness.execute(command)).rejects.toBe(persistenceFailure);
    expect(harness.orderRouteOutcome).toHaveBeenCalledWith({
      operation: 'preview',
      status: 'failed',
      kind: 'queued_move',
      reason: 'manual_rebatch',
    });
  });

  it('keeps policy faults out of the database-failure category', async () => {
    const harness = setup();
    const policyFailure = invariantViolationError({
      code: 'preview_policy_fault_fixture',
      message: 'Preview policy fault fixture.',
      safeMessage: 'Preview policy fault fixture.',
    });
    const execute = makeExecutePreviewOrderRoute({
      repo: { load: harness.load },
      policy: {
        ...productionRules,
        evaluateProductionOrderOperationalAccess: () => {
          throw policyFailure;
        },
      },
      signals: {
        orderRouteOutcome: harness.orderRouteOutcome,
        queueConflict: harness.queueConflict,
      },
    });

    await expect(execute(command)).rejects.toBe(policyFailure);
    expect(harness.orderRouteOutcome).toHaveBeenCalledWith({
      operation: 'preview',
      status: 'failed',
      kind: 'queued_move',
      reason: 'manual_rebatch',
    });
  });
});
