import { describe, expect, it } from 'vitest';
import { productionRules } from '../rules.ts';
import { evaluateOrderRouteProposal } from './evaluate.ts';
import type {
  OrderRouteProposalContext,
  OrderRouteProposalCommand,
} from './model.ts';

const ids = {
  run: '10000000-0000-4000-8000-000000000001',
  order: '10000000-0000-4000-8000-000000000002',
  source: '10000000-0000-4000-8000-000000000003',
  target: '10000000-0000-4000-8000-000000000004',
  membership: '10000000-0000-4000-8000-000000000005',
  actor: '10000000-0000-4000-8000-000000000006',
} as const;

const stages = ['sorting', 'washing', 'drying', 'folding_packaging'] as const;

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

describe('order route proposal evaluation', () => {
  it('produces the complete deterministic whole-order proposal and hash', () => {
    const decision = evaluateOrderRouteProposal({
      command,
      context: context(),
      policy: productionRules,
      consistency: 'snapshot',
    });

    expect(decision).toEqual({
      kind: 'propose',
      proposal: {
        kind: 'queued_move',
        productionRunId: ids.run,
        productionOrderId: ids.order,
        sourceProductionBatchId: ids.source,
        sourceBatchSequence: 0,
        targetProductionBatchId: ids.target,
        targetBatchSequence: 1,
        restartStage: 'sorting',
        releasedStages: stages,
        assignedStages: stages,
        orderWeightLbs: 25,
        targetWeightLbs: 75,
        targetCapacityLbs: 100,
        expectedQueueVersion: 4,
        expectedOrderVersion: 3,
        expectedSourceBatchVersion: 2,
        expectedTargetBatchVersion: 5,
        proposalHash:
          '8be903b98fe772984bec28fba7465728e0a97b39a5d852f63c4ba150c6ade60c',
      },
    });
  });

  it('preserves queue-version conflicts before routing policy evaluation', () => {
    expect(
      evaluateOrderRouteProposal({
        command: { ...command, expectedQueueVersion: 3 },
        context: context(),
        policy: productionRules,
        consistency: 'snapshot',
      }),
    ).toEqual({
      kind: 'reject',
      failure: {
        kind: 'conflict',
        code: 'production_queue_version_conflict',
        message: 'The production queue changed before the order move.',
        safeMessage: 'The production queue changed before the order move.',
      },
    });
  });

  it('derives an in-flight exception from ordered stage and attempt facts', () => {
    const base = context();
    const sourceStages = stages.map((stage, index) => ({
      stageRunId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      stage,
      status:
        stage === 'sorting'
          ? ('completed' as const)
          : stage === 'washing'
            ? ('started' as const)
            : ('planned' as const),
      assignedWeightLbs: 70,
      capacityLbs: 100,
    }));
    const exceptionContext: OrderRouteProposalContext = {
      ...base,
      source: {
        ...base.source,
        status: 'washing',
        membershipFrozen: true,
      },
      candidates: [
        {
          ...base.candidates[0]!,
          productionBatchId: ids.source,
          sequence: 0,
          status: 'washing',
          membershipFrozen: true,
          version: 2,
          derivedWeightLbs: 70,
          stages: sourceStages,
        },
        base.candidates[0]!,
      ],
      attempts: stages.map((stage, index) => ({
        id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        stageRunId: sourceStages[index]!.stageRunId,
        productionBatchId: ids.source,
        stage,
        attemptNumber: 1,
        status:
          stage === 'sorting' ? ('completed' as const) : ('assigned' as const),
      })),
    };

    const decision = evaluateOrderRouteProposal({
      command: {
        locationId: command.locationId,
        productionRunId: command.productionRunId,
        productionOrderId: command.productionOrderId,
        actorId: command.actorId,
        authorizedAction: command.authorizedAction,
        kind: 'exception',
        reason: 'rewash_required',
        restartStage: 'washing',
        expectedQueueVersion: command.expectedQueueVersion,
        expectedOrderVersion: command.expectedOrderVersion,
        expectedSourceBatchVersion: command.expectedSourceBatchVersion,
      },
      context: exceptionContext,
      policy: productionRules,
      consistency: 'snapshot',
    });

    expect(decision).toMatchObject({
      kind: 'propose',
      proposal: {
        releasedStages: ['washing', 'drying', 'folding_packaging'],
        assignedStages: ['washing', 'drying', 'folding_packaging'],
        targetProductionBatchId: ids.target,
      },
    });
  });

  it('returns semantic validation when no target has hard capacity', () => {
    const base = context();
    const target = base.candidates[0]!;
    const decision = evaluateOrderRouteProposal({
      command,
      context: {
        ...base,
        candidates: [
          {
            ...target,
            stages: target.stages.map((stage) => ({
              ...stage,
              capacityLbs: 70,
            })),
          },
        ],
      },
      policy: productionRules,
      consistency: 'snapshot',
    });

    expect(decision).toEqual({
      kind: 'reject',
      failure: {
        kind: 'validation',
        classification: 'semantic',
        code: 'hard_capacity_exceeded',
        message:
          'The whole order exceeds capacity in every otherwise-feasible target.',
        safeMessage:
          'The whole order exceeds capacity in every otherwise-feasible target.',
      },
    });
  });

  it('keeps malformed snapshot facts expected but makes the same locked graph invariant', () => {
    const base = context();
    const malformed: OrderRouteProposalContext = {
      ...base,
      source: {
        ...base.source,
        status: 'washing',
        membershipFrozen: true,
      },
      candidates: [
        {
          ...base.candidates[0]!,
          productionBatchId: ids.source,
          sequence: 0,
          status: 'washing',
          membershipFrozen: true,
          stages: base.candidates[0]!.stages.slice(0, 1),
        },
        base.candidates[0]!,
      ],
    };
    const exception: OrderRouteProposalCommand = {
      locationId: command.locationId,
      productionRunId: command.productionRunId,
      productionOrderId: command.productionOrderId,
      actorId: command.actorId,
      authorizedAction: command.authorizedAction,
      kind: 'exception',
      reason: 'rewash_required',
      restartStage: 'washing',
      expectedQueueVersion: command.expectedQueueVersion,
      expectedOrderVersion: command.expectedOrderVersion,
      expectedSourceBatchVersion: command.expectedSourceBatchVersion,
    };

    expect(
      evaluateOrderRouteProposal({
        command: exception,
        context: malformed,
        policy: productionRules,
        consistency: 'snapshot',
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'source_stage_graph_invalid' },
    });
    expect(() =>
      evaluateOrderRouteProposal({
        command: exception,
        context: malformed,
        policy: productionRules,
        consistency: 'locked',
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'production_order_route_source_stage_graph_invalid',
      }),
    );
  });
});
