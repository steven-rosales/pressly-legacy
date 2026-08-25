import { proveOperation } from '@pressly/testkit/operation-proof';
import { commitOrderRouteCellDeclaration } from './cell.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import { describe, expect, it } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import type { OrderRouteProposalContext } from '../../../model/order-route-proposal/model.ts';
import { decideCommitOrderRoute } from './decide.ts';
import type { CommitOrderRouteCommand } from './types.ts';

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
  attempts: stages.map((stage, index) => ({
    id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    stageRunId: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    productionBatchId: ids.source,
    stage,
    attemptNumber: 1,
    status: 'assigned' as const,
  })),
});

const command: CommitOrderRouteCommand = {
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
  proposalHash:
    '8be903b98fe772984bec28fba7465728e0a97b39a5d852f63c4ba150c6ade60c',
  idempotencyKey: 'commit-route-1',
};

describe('commit order route decision', () => {
  proveOperation({
    operationId: 'production.commit-order-route.v1',
    declaration: commitOrderRouteCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'recomputes the locked proposal and derives every release lifecycle',
        proves: ['decision'],
        run: () => {
          expect(
            decideCommitOrderRoute({
              command,
              context: context(),
              policy: productionRules,
            }),
          ).toMatchObject({
            kind: 'commit',
            plan: {
              proposal: { proposalHash: command.proposalHash },
              initialAttemptState: 'assigned',
              attemptLifecycles: stages.map((stage, index) => ({
                attemptId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
                lifecycle: { from: 'assigned', state: 'released' },
              })),
            },
          });
        },
      },
    ],
  });

  it('rejects a stale proposal hash after the locked recomputation', () => {
    expect(
      decideCommitOrderRoute({
        command: { ...command, proposalHash: 'f'.repeat(64) },
        context: context(),
        policy: productionRules,
      }),
    ).toEqual({
      kind: 'reject',
      failure: {
        kind: 'conflict',
        code: 'production_order_route_proposal_stale',
        message: 'The proposed order route no longer matches production.',
        safeMessage: 'The proposed order route no longer matches production.',
      },
    });
  });

  it('preserves proposal version precedence before the hash fence', () => {
    expect(
      decideCommitOrderRoute({
        command: { ...command, expectedQueueVersion: 3 },
        context: context(),
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_queue_version_conflict' },
    });
  });

  it('requires exactly one assigned source attempt for every released stage', () => {
    const facts = context();
    expect(
      decideCommitOrderRoute({
        command,
        context: { ...facts, attempts: facts.attempts.slice(1) },
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_order_stage_attempt_not_assigned' },
    });
  });

  it('maps an attempt lifecycle denial to the canonical conflict', () => {
    expect(
      decideCommitOrderRoute({
        command,
        context: context(),
        policy: {
          ...productionRules,
          evaluateProductionOrderStageAttemptTransition: () => ({
            tag: 'err',
            error: {
              code: 'PRODUCTION_ORDER_STAGE_ATTEMPT_EVENT_NOT_ALLOWED',
              message:
                'The production order stage attempt event is not allowed.',
            },
          }),
        },
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: {
        code: 'production_order_stage_attempt_event_not_allowed',
      },
    });
  });

  it('keeps impossible locked proposal graphs throwable', () => {
    const fault = invariantViolationError({
      code: 'locked_route_graph_fault',
      message: 'Locked route graph fault.',
      safeMessage: 'Locked route graph fault.',
    });
    expect(() =>
      decideCommitOrderRoute({
        command,
        context: context(),
        policy: {
          ...productionRules,
          evaluateOrderRouting: () => {
            throw fault;
          },
        },
      }),
    ).toThrow(fault);
  });
});
