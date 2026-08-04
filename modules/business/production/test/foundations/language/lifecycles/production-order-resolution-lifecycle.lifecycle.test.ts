import { describe, expect, it } from 'vitest';
import {
  allowedProductionOrderResolutionEvents,
  evaluateProductionOrderResolutionGuard,
  evaluateProductionOrderOperationalAccess,
  evaluateProductionOrderResolutionTransition,
  initialProductionOrderResolutionState,
  productionOrderResolutionGraph,
  type ProductionOrderResolutionEvent,
  type ProductionOrderResolutionState,
} from '../../../../src/foundations/language/lifecycles/production-order-resolution-lifecycle.lifecycle.ts';
import { defineProductionRules } from '../../../../src/foundations/language/rules/production-rules.factory.ts';

const states = [
  'open',
  'resolved_without_production',
] as const satisfies readonly ProductionOrderResolutionState[];
const events = [
  'resolve_without_production',
  'restore',
] as const satisfies readonly ProductionOrderResolutionEvent[];

describe('production order resolution lifecycle', () => {
  const expected = new Map<string, ProductionOrderResolutionState>([
    ['open:resolve_without_production', 'resolved_without_production'],
    ['resolved_without_production:restore', 'open'],
  ]);

  it('defines every state-event pair in the transition matrix', () => {
    for (const state of states) {
      for (const event of events) {
        const decision = evaluateProductionOrderResolutionTransition({
          state,
          event,
        });
        const next = expected.get(`${state}:${event}`);

        if (next === undefined) {
          expect(decision).toEqual({
            tag: 'err',
            error: {
              code: 'PRODUCTION_ORDER_RESOLUTION_EVENT_NOT_ALLOWED',
              message: 'The production order resolution event is not allowed.',
            },
          });
        } else {
          expect(decision).toEqual({
            tag: 'ok',
            value: { from: state, state: next },
          });
        }
      }
    }
  });

  it.each([
    ['open', ['resolve_without_production']],
    ['resolved_without_production', ['restore']],
    ['unknown', []],
  ] as const)('exposes allowed events for %s', (state, allowed) => {
    expect(allowedProductionOrderResolutionEvents(state)).toEqual(allowed);
  });

  it('rejects an invalid persisted state', () => {
    expect(
      evaluateProductionOrderResolutionTransition({
        state: 'unknown',
        event: 'resolve_without_production',
      }),
    ).toEqual({
      tag: 'err',
      error: {
        code: 'PRODUCTION_ORDER_RESOLUTION_STATE_INVALID',
        message: 'The production order resolution state is invalid.',
      },
    });
  });

  it('publishes one initial state and the exact reversible graph', () => {
    expect(initialProductionOrderResolutionState).toBe('open');
    expect(productionOrderResolutionGraph).toEqual([
      {
        from: 'open',
        event: 'resolve_without_production',
        to: 'resolved_without_production',
        description:
          'Remove never-produced work from active operations without deleting or finishing it.',
      },
      {
        from: 'resolved_without_production',
        event: 'restore',
        to: 'open',
        description:
          'Restore retained never-produced work to active operational evaluation.',
      },
    ]);
  });

  it('admits only open orders to operational commands', () => {
    expect(
      evaluateProductionOrderOperationalAccess({ resolutionState: 'open' }),
    ).toEqual({ tag: 'ok', value: { resolutionState: 'open' } });
    expect(
      evaluateProductionOrderOperationalAccess({
        resolutionState: 'resolved_without_production',
      }),
    ).toEqual({
      tag: 'err',
      error: {
        code: 'PRODUCTION_ORDER_RESOLVED',
        message: 'This order is archived from active production work.',
      },
    });
    expect(
      evaluateProductionOrderOperationalAccess({ resolutionState: 'unknown' }),
    ).toEqual({
      tag: 'err',
      error: {
        code: 'PRODUCTION_ORDER_RESOLUTION_STATE_INVALID',
        message: 'The production order resolution state is invalid.',
      },
    });
  });

  it('publishes the operational access evaluator through the composed policy', () => {
    expect(
      defineProductionRules().evaluateProductionOrderOperationalAccess({
        resolutionState: 'resolved_without_production',
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'PRODUCTION_ORDER_RESOLVED' },
    });
  });
});

describe('production order resolution cross-lifecycle guard', () => {
  const base = {
    executionState: 'unassigned',
    hasShiftSelection: false,
    hasBatchMembership: false,
    hasStageAttempt: false,
    hasRoute: false,
    hasIntake: false,
    hasManualAdmission: false,
    isPriority: false,
    hasPendingPlacement: false,
  } as const;

  it('allows untouched unassigned work without extra review', () => {
    expect(evaluateProductionOrderResolutionGuard(base)).toEqual({
      status: 'allowed',
      requiresExplicitReview: false,
      reviewReasons: [],
      mayClearPendingPlacement: false,
    });
  });

  it('requires explicit review for retained operational facts', () => {
    expect(
      evaluateProductionOrderResolutionGuard({
        ...base,
        hasIntake: true,
        hasManualAdmission: true,
        isPriority: true,
        hasPendingPlacement: true,
      }),
    ).toEqual({
      status: 'allowed',
      requiresExplicitReview: true,
      reviewReasons: [
        'intake_recorded',
        'manual_admission',
        'priority',
        'pending_placement',
      ],
      mayClearPendingPlacement: true,
    });
  });

  it('blocks every form of committed or historical production participation', () => {
    expect(
      evaluateProductionOrderResolutionGuard({
        ...base,
        executionState: 'scheduled',
        hasShiftSelection: true,
        hasBatchMembership: true,
        hasStageAttempt: true,
        hasRoute: true,
      }),
    ).toEqual({
      status: 'blocked',
      blockReasons: [
        'execution_committed',
        'selected_for_shift',
        'batch_membership_exists',
        'stage_attempt_exists',
        'route_exists',
      ],
    });
  });
});
