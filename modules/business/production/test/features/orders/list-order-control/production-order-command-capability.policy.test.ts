import { describe, expect, it } from 'vitest';
import { assessProductionOrderCommandCapabilities } from '../../../../src/features/orders/list-order-control/production-order-command-capability.policy.ts';
import type { OrderRoutingDecision } from '../../../../src/foundations/language/order-routing/order-routing.policy.ts';
import { productionRules } from '../../../../src/foundations/language/rules/production-rules.factory.ts';
import type { ProductionRules } from '../../../../src/foundations/language/rules/production-rules.model.ts';
import { allowPolicy } from '../../../support/production.fake.ts';

const batch = (
  id: string,
  sequence: number,
  input: Readonly<{
    status?:
      | 'queued'
      | 'sorting'
      | 'washing'
      | 'drying'
      | 'folding_packaging'
      | 'finished';
    stageStatuses?: Partial<
      Record<
        'sorting' | 'washing' | 'drying' | 'folding_packaging',
        'planned' | 'started' | 'completed'
      >
    >;
    membershipFrozen?: boolean;
    version?: number;
    derivedWeightLbs?: number;
    capacityLbs?: number;
  }> = {},
) => {
  const status = input.status ?? 'queued';
  const capacityLbs = input.capacityLbs ?? 100;
  const derivedWeightLbs = input.derivedWeightLbs ?? 40;
  return {
    productionBatchId: id,
    sequence,
    status,
    membershipFrozen: input.membershipFrozen ?? false,
    version: input.version ?? 1,
    derivedWeightLbs,
    pulseCapacityLbs: capacityLbs,
    stages: (
      ['sorting', 'washing', 'drying', 'folding_packaging'] as const
    ).map((stage) => ({
      stage,
      status:
        input.stageStatuses?.[stage] ??
        (status !== 'queued' && status !== 'finished' && stage === status
          ? ('started' as const)
          : ('planned' as const)),
      assignedWeightLbs: derivedWeightLbs,
      capacityLbs,
    })),
  } as const;
};

const context = (
  input: Readonly<{
    source?: ReturnType<typeof batch>;
    candidates?: readonly ReturnType<typeof batch>[];
    activeOrderCount?: number;
    sourceAttempts?: readonly Readonly<{
      stage: 'sorting' | 'washing' | 'drying' | 'folding_packaging';
      status: 'assigned' | 'completed' | 'released';
    }>[];
  }> = {},
) => {
  const source = input.source ?? batch('source-batch', 0);
  return {
    order: {
      id: 'order-1',
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      resolutionState: 'open',
      version: 3,
      weightLbs: 20,
    },
    run: { id: 'run-1', status: 'started', queueVersion: 5 },
    source: { ...source, activeOrderCount: input.activeOrderCount ?? 2 },
    sourceAttempts:
      input.sourceAttempts ??
      source.stages.map((stage) => ({
        stage: stage.stage,
        status:
          stage.status === 'completed'
            ? ('completed' as const)
            : ('assigned' as const),
      })),
    candidates: input.candidates ?? [
      source,
      batch('target-batch', 1, { version: 4 }),
    ],
  } as const;
};

const withRouteDecision = (
  decide: () => OrderRoutingDecision,
): ProductionRules => ({
  ...allowPolicy,
  evaluateOrderRouting: decide,
});

describe('production order command capabilities', () => {
  it('returns exact per-target decisions and command-bound versions', () => {
    const capabilities = assessProductionOrderCommandCapabilities(
      withRouteDecision(() => ({
        decision: 'rejected',
        command: 'defer_or_rework',
        reason: {
          code: 'EXCEPTION_SOURCE_NOT_IN_FLIGHT',
          message: 'The source batch has not started.',
        },
      })),
      context(),
    );

    expect(capabilities).toEqual({
      queuedMove: {
        status: 'allowed',
        expectedQueueVersion: 5,
        expectedOrderVersion: 3,
        expectedSourceBatchVersion: 1,
        targets: [
          {
            productionBatchId: 'source-batch',
            batchSequence: 0,
            batchStatus: 'queued',
            membershipFrozen: false,
            expectedBatchVersion: 1,
            currentWeightLbs: 40,
            projectedWeightLbs: 60,
            capacityLbs: 100,
            feasibility: {
              status: 'blocked',
              code: 'TARGET_IS_SOURCE_BATCH',
            },
          },
          expect.objectContaining({
            productionBatchId: 'target-batch',
            expectedBatchVersion: 4,
            feasibility: { status: 'allowed' },
          }),
        ],
      },
      routeException: {
        status: 'blocked',
        code: 'EXCEPTION_SOURCE_NOT_IN_FLIGHT',
      },
    });
  });

  it('blocks both commands when moving the sole source order would empty its batch', () => {
    expect(
      assessProductionOrderCommandCapabilities(
        allowPolicy,
        context({ activeOrderCount: 1 }),
      ),
    ).toMatchObject({
      queuedMove: {
        status: 'blocked',
        code: 'SOURCE_BATCH_WOULD_BE_EMPTY',
      },
      routeException: {
        status: 'blocked',
        code: 'SOURCE_BATCH_WOULD_BE_EMPTY',
      },
    });
  });

  it('allows an in-flight exception while denying ordinary queued movement', () => {
    const source = batch('source-batch', 0, {
      status: 'sorting',
      membershipFrozen: true,
    });
    const capabilities = assessProductionOrderCommandCapabilities(
      withRouteDecision(() => ({
        decision: 'accepted',
        command: 'defer_or_rework',
        wholeOrder: { productionOrderId: 'order-1', weightLbs: 20 },
        route: {
          sourceProductionBatchId: 'source-batch',
          sourceSequence: 0,
          targetProductionBatchId: 'target-batch',
          targetSequence: 1,
          currentStage: 'sorting',
          restartStage: 'sorting',
          releasedUnfinishedStages: [
            'sorting',
            'washing',
            'drying',
            'folding_packaging',
          ],
          reworkStages: [],
          targetAssignments: [],
        },
      })),
      context({
        source,
        candidates: [source, batch('target-batch', 1)],
      }),
    );

    expect(capabilities).toMatchObject({
      queuedMove: {
        status: 'blocked',
        code: 'QUEUED_REBATCH_SOURCE_NOT_QUEUED',
      },
      routeException: {
        status: 'allowed',
        expectedQueueVersion: 5,
        expectedOrderVersion: 3,
        expectedSourceBatchVersion: 1,
      },
    });
  });

  it('keeps exact target capacity denial behind a no-feasible-target command denial', () => {
    const source = batch('source-batch', 0);
    const overloaded = batch('target-batch', 1, {
      derivedWeightLbs: 90,
      capacityLbs: 100,
    });
    expect(
      assessProductionOrderCommandCapabilities(
        allowPolicy,
        context({ source, candidates: [source, overloaded] }),
      ),
    ).toMatchObject({
      queuedMove: {
        status: 'blocked',
        code: 'NO_FEASIBLE_TARGET',
        targets: [
          {
            feasibility: {
              status: 'blocked',
              code: 'TARGET_IS_SOURCE_BATCH',
            },
          },
          {
            feasibility: {
              status: 'blocked',
              code: 'HARD_CAPACITY_EXCEEDED',
            },
          },
        ],
      },
    });
  });

  it('allows an exception in the completed-washing gap when drying remains feasible', () => {
    const source = batch('source-batch', 0, {
      status: 'washing',
      membershipFrozen: true,
      stageStatuses: {
        sorting: 'completed',
        washing: 'completed',
      },
    });
    const target = batch('target-batch', 1, {
      status: 'washing',
      membershipFrozen: true,
      stageStatuses: {
        sorting: 'completed',
        washing: 'started',
      },
    });

    expect(
      assessProductionOrderCommandCapabilities(
        productionRules,
        context({ source, candidates: [source, target] }),
      ),
    ).toMatchObject({
      routeException: {
        status: 'allowed',
        expectedQueueVersion: 5,
        expectedOrderVersion: 3,
        expectedSourceBatchVersion: 1,
      },
    });
  });
});
