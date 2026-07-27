import { describe, expect, it } from 'vitest';
import {
  allowedProductionBatchEvents,
  evaluateProductionBatchTransition,
  initialProductionBatchState,
  productionBatchGraph,
  type ProductionBatchLifecycleEvent,
  type ProductionBatchLifecycleState,
} from '../../src/lifecycle/production-batch-lifecycle.policy.ts';
import {
  allowedProductionOrderExecutionEvents,
  evaluateProductionOrderExecutionTransition,
  initialProductionOrderExecutionState,
  productionOrderExecutionGraph,
  resolveProductionOrderExecutionState,
  type ProductionOrderExecutionEvent,
  type ProductionOrderExecutionState,
} from '../../src/lifecycle/production-order-execution-lifecycle.policy.ts';
import {
  allowedProductionOrderStageAttemptEvents,
  evaluateProductionOrderStageAttemptTransition,
  initialProductionOrderStageAttemptState,
  productionOrderStageAttemptGraph,
  type ProductionOrderStageAttemptEvent,
  type ProductionOrderStageAttemptState,
} from '../../src/lifecycle/production-order-stage-attempt-lifecycle.policy.ts';
import {
  allowedProductionStageEvents,
  evaluateStageTransition,
  type StageEvent,
  type StageState,
} from '../../src/stage-transition/stage-transition.policy.ts';
import { deriveProductionOrderOperationalStatus } from '../../src/lifecycle/production-order-operational-status.policy.ts';

const batchStates = [
  'queued',
  'sorting',
  'washing',
  'drying',
  'folding_packaging',
  'finished',
] as const satisfies readonly ProductionBatchLifecycleState[];
const batchEvents = [
  'start_sorting',
  'start_washing',
  'start_drying',
  'start_folding_packaging',
  'finish',
  'reconcile_to_sorting',
  'reconcile_to_washing',
  'reconcile_to_drying',
  'reconcile_to_folding_packaging',
  'reconcile_to_finished',
] as const satisfies readonly ProductionBatchLifecycleEvent[];

describe('production batch lifecycle', () => {
  const expected = new Map<string, ProductionBatchLifecycleState>([
    ['queued:start_sorting', 'sorting'],
    ['sorting:start_washing', 'washing'],
    ['washing:start_drying', 'drying'],
    ['drying:start_folding_packaging', 'folding_packaging'],
    ['folding_packaging:finish', 'finished'],
    ['queued:reconcile_to_sorting', 'sorting'],
    ['queued:reconcile_to_washing', 'washing'],
    ['sorting:reconcile_to_washing', 'washing'],
    ['queued:reconcile_to_drying', 'drying'],
    ['sorting:reconcile_to_drying', 'drying'],
    ['washing:reconcile_to_drying', 'drying'],
    ['queued:reconcile_to_folding_packaging', 'folding_packaging'],
    ['sorting:reconcile_to_folding_packaging', 'folding_packaging'],
    ['washing:reconcile_to_folding_packaging', 'folding_packaging'],
    ['drying:reconcile_to_folding_packaging', 'folding_packaging'],
    ['queued:reconcile_to_finished', 'finished'],
    ['sorting:reconcile_to_finished', 'finished'],
    ['washing:reconcile_to_finished', 'finished'],
    ['drying:reconcile_to_finished', 'finished'],
    ['folding_packaging:reconcile_to_finished', 'finished'],
  ]);

  it('defines every state-event pair in the transition matrix', () => {
    for (const state of batchStates) {
      for (const event of batchEvents) {
        const decision = evaluateProductionBatchTransition({ state, event });
        const next = expected.get(`${state}:${event}`);

        if (next === undefined) {
          expect(decision).toEqual({
            tag: 'err',
            error: {
              code: 'PRODUCTION_BATCH_EVENT_NOT_ALLOWED',
              message: 'The production batch event is not allowed.',
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

  it('keeps terminal batches closed and rejects invalid persisted states', () => {
    expect(allowedProductionBatchEvents('finished')).toEqual([]);
    expect(allowedProductionBatchEvents('unknown')).toEqual([]);
    expect(
      evaluateProductionBatchTransition({
        state: 'unknown',
        event: 'start_sorting',
      }),
    ).toEqual({
      tag: 'err',
      error: {
        code: 'PRODUCTION_BATCH_STATE_INVALID',
        message: 'The production batch state is invalid.',
      },
    });
  });

  it('publishes one initial state and the full graph', () => {
    expect(initialProductionBatchState).toBe('queued');
    expect(productionBatchGraph).toHaveLength(expected.size);
  });
});

const executionStates = [
  'unassigned',
  'scheduled',
  'finished',
] as const satisfies readonly ProductionOrderExecutionState[];
const executionEvents = [
  'schedule_or_place',
  'finish_with_batch',
] as const satisfies readonly ProductionOrderExecutionEvent[];

describe('production order execution lifecycle', () => {
  const expected = new Map<string, ProductionOrderExecutionState>([
    ['unassigned:schedule_or_place', 'scheduled'],
    ['scheduled:finish_with_batch', 'finished'],
  ]);

  it('defines every state-event pair in the transition matrix', () => {
    for (const state of executionStates) {
      for (const event of executionEvents) {
        const decision = evaluateProductionOrderExecutionTransition({
          state,
          event,
        });
        const next = expected.get(`${state}:${event}`);

        expect(decision.tag).toBe(next === undefined ? 'err' : 'ok');
        if (decision.tag === 'ok')
          expect(decision.value).toEqual({ from: state, state: next });
      }
    }
  });

  it.each([
    ['unassigned', ['schedule_or_place']],
    ['scheduled', ['finish_with_batch']],
    ['finished', []],
    ['unknown', []],
  ] as const)('exposes allowed events for %s', (state, events) => {
    expect(allowedProductionOrderExecutionEvents(state)).toEqual(events);
  });

  it.each([
    ['unassigned', 'eligible', 'unassigned'],
    ['unassigned', 'scheduled', 'scheduled'],
    ['unassigned', 'finished', 'finished'],
    ['scheduled', 'eligible', 'scheduled'],
    ['scheduled', 'finished', 'finished'],
    ['finished', 'scheduled', 'finished'],
    [null, 'scheduled', 'scheduled'],
  ] as const)(
    'resolves execution=%s and legacy=%s monotonically to %s',
    (executionState, operationalStatus, expectedState) => {
      expect(
        resolveProductionOrderExecutionState({
          executionState,
          operationalStatus,
        }),
      ).toEqual({ tag: 'ok', value: expectedState });
    },
  );

  it('rejects an invalid authoritative execution state', () => {
    expect(
      resolveProductionOrderExecutionState({
        executionState: 'lost',
        operationalStatus: 'scheduled',
      }),
    ).toEqual({
      tag: 'err',
      error: {
        code: 'PRODUCTION_ORDER_EXECUTION_STATE_INVALID',
        message: 'The production order execution state is invalid.',
      },
    });
  });

  it('publishes one initial state and the exact graph', () => {
    expect(initialProductionOrderExecutionState).toBe('unassigned');
    expect(productionOrderExecutionGraph).toHaveLength(expected.size);
  });
});

describe('production order operational status', () => {
  it.each([
    ['finished', 'withdrawn', null, false, null, 'finished'],
    ['scheduled', 'withdrawn', null, false, null, 'scheduled'],
    ['unassigned', 'withdrawn', null, true, 1, 'ineligible'],
    ['unassigned', 'post_production', null, true, 1, 'ineligible'],
    ['unassigned', 'released', null, false, 1, 'ineligible'],
    ['unassigned', 'unreleased', null, true, null, 'release_pending'],
    ['unassigned', 'unreleased', 'released', true, null, 'intake_pending'],
    ['unassigned', 'released', null, true, null, 'intake_pending'],
    ['unassigned', 'released', null, true, 0, 'eligible'],
    ['unassigned', 'released', null, true, 3, 'eligible'],
  ] as const)(
    'derives execution=%s admission=%s override=%s demand=%s bags=%s as %s',
    (
      executionState,
      admission,
      admissionOverride,
      hasPositiveDemand,
      bagCount,
      expected,
    ) => {
      expect(
        deriveProductionOrderOperationalStatus({
          executionState,
          admission,
          admissionOverride,
          hasPositiveDemand,
          bagCount,
        }),
      ).toBe(expected);
    },
  );
});

const attemptStates = [
  'assigned',
  'completed',
  'released',
] as const satisfies readonly ProductionOrderStageAttemptState[];
const attemptEvents = [
  'complete_with_stage',
  'release_for_route',
] as const satisfies readonly ProductionOrderStageAttemptEvent[];

describe('production order stage attempt lifecycle', () => {
  const expected = new Map<string, ProductionOrderStageAttemptState>([
    ['assigned:complete_with_stage', 'completed'],
    ['assigned:release_for_route', 'released'],
  ]);

  it('defines every state-event pair in the transition matrix', () => {
    for (const state of attemptStates) {
      for (const event of attemptEvents) {
        const decision = evaluateProductionOrderStageAttemptTransition({
          state,
          event,
        });
        const next = expected.get(`${state}:${event}`);

        expect(decision.tag).toBe(next === undefined ? 'err' : 'ok');
        if (decision.tag === 'ok')
          expect(decision.value).toEqual({ from: state, state: next });
      }
    }
  });

  it.each([
    ['assigned', ['complete_with_stage', 'release_for_route']],
    ['completed', []],
    ['released', []],
    ['unknown', []],
  ] as const)('exposes allowed events for %s', (state, events) => {
    expect(allowedProductionOrderStageAttemptEvents(state)).toEqual(events);
  });

  it('rejects an invalid persisted attempt state', () => {
    expect(
      evaluateProductionOrderStageAttemptTransition({
        state: 'unknown',
        event: 'complete_with_stage',
      }),
    ).toEqual({
      tag: 'err',
      error: {
        code: 'PRODUCTION_ORDER_STAGE_ATTEMPT_STATE_INVALID',
        message: 'The production order stage attempt state is invalid.',
      },
    });
  });

  it('publishes one initial state and two terminal edges', () => {
    expect(initialProductionOrderStageAttemptState).toBe('assigned');
    expect(productionOrderStageAttemptGraph).toHaveLength(expected.size);
  });
});

describe('production stage reconciliation lifecycle', () => {
  const states = [
    'planned',
    'started',
    'completed',
  ] as const satisfies readonly StageState[];
  const events = [
    'start',
    'complete',
    'reconcile_start',
    'reconcile_complete',
  ] as const satisfies readonly StageEvent['type'][];
  const expected = new Map<string, StageState>([
    ['planned:start', 'started'],
    ['started:complete', 'completed'],
    ['planned:reconcile_start', 'started'],
    ['planned:reconcile_complete', 'completed'],
    ['started:reconcile_complete', 'completed'],
  ]);
  const entity = {
    plannedStartAt: new Date('2026-07-26T12:00:00.000Z'),
    plannedEndAt: new Date('2026-07-26T13:00:00.000Z'),
    actualStartAt: new Date('2026-07-26T12:00:00.000Z'),
  };
  const context = {
    now: new Date('2026-07-26T14:00:00.000Z'),
    productionRunStarted: true,
    previousStageCompleted: true,
    sameKindAlreadyActive: false,
    machinesRequired: false,
    assignedMachineIds: [],
    overlappingMachineIds: [],
  };

  it('defines every live and reconciliation state-event pair', () => {
    for (const state of states) {
      for (const event of events) {
        const decision = evaluateStageTransition(
          { ...entity, state },
          { type: event },
          context,
        );
        const next = expected.get(`${state}:${event}`);

        expect(decision.tag).toBe(next === undefined ? 'err' : 'ok');
        if (decision.tag === 'ok') {
          expect(decision.value.status).toBe('allowed');
          if (decision.value.status === 'allowed')
            expect(decision.value.state).toBe(next);
        }
      }
    }
  });

  it.each([
    ['planned', ['start', 'reconcile_start', 'reconcile_complete']],
    ['started', ['complete', 'reconcile_complete']],
    ['completed', []],
    ['unknown', []],
  ] as const)('exposes allowed events for %s', (state, events) => {
    expect(allowedProductionStageEvents(state)).toEqual(events);
  });

  it('rejects an invalid persisted stage state', () => {
    expect(
      evaluateStageTransition(
        { ...entity, state: 'unknown' },
        { type: 'reconcile_complete' },
        context,
      ),
    ).toEqual({
      tag: 'err',
      error: {
        code: 'UNKNOWN_STATE',
        message: 'The production stage transition is not allowed.',
      },
    });
  });
});
