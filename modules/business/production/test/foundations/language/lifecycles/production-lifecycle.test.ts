import { describe, expect, it } from 'vitest';
import {
  allowedProductionRunEvents,
  evaluateProductionRunTransition,
  initialProductionRunState,
  productionRunGraph,
} from '../../../../src/foundations/language/lifecycles/production-run-lifecycle.lifecycle.ts';
import {
  allowedProductionShiftEvents,
  evaluateProductionShiftTransition,
  initialProductionShiftState,
  productionShiftGraph,
} from '../../../../src/foundations/language/lifecycles/production-shift-lifecycle.lifecycle.ts';
import {
  allowedScheduleRevisionEvents,
  evaluateScheduleRevisionTransition,
  initialScheduleRevisionState,
  scheduleRevisionGraph,
  type ScheduleRevisionLifecycleEvent,
  type ScheduleRevisionLifecycleState,
} from '../../../../src/foundations/language/lifecycles/schedule-revision-lifecycle.lifecycle.ts';

describe('production shift lifecycle', () => {
  it('defines the complete state-event matrix', () => {
    expect(
      evaluateProductionShiftTransition({
        state: 'open',
        event: 'close_after_execution',
      }),
    ).toEqual({
      tag: 'ok',
      value: { from: 'open', state: 'closed' },
    });
    expect(
      evaluateProductionShiftTransition({
        state: 'closed',
        event: 'close_after_execution',
      }),
    ).toEqual({
      tag: 'err',
      error: {
        code: 'PRODUCTION_SHIFT_EVENT_NOT_ALLOWED',
        message: 'The production shift event is not allowed.',
      },
    });
  });

  it.each([
    ['open', ['close_after_execution']],
    ['closed', []],
    ['draft', []],
  ] as const)('exposes allowed events for %s', (state, expected) => {
    expect(allowedProductionShiftEvents(state)).toEqual(expected);
  });

  it('publishes the exact graph and runtime initial state', () => {
    expect(initialProductionShiftState).toBe('open');
    expect(productionShiftGraph).toEqual([
      {
        from: 'open',
        event: 'close_after_execution',
        to: 'closed',
        description:
          'Close the shift atomically when its final production work completes.',
      },
    ]);
  });
});

describe('schedule revision lifecycle', () => {
  const states = [
    'draft',
    'accepted',
    'superseded',
    'rejected',
  ] as const satisfies readonly ScheduleRevisionLifecycleState[];
  const events = [
    'accept',
    'supersede',
    'reject',
  ] as const satisfies readonly ScheduleRevisionLifecycleEvent[];
  const expected = new Map<string, ScheduleRevisionLifecycleState>([
    ['draft:accept', 'accepted'],
    ['draft:supersede', 'superseded'],
    ['draft:reject', 'rejected'],
    ['accepted:supersede', 'superseded'],
  ]);

  it('defines every state-event pair in the transition matrix', () => {
    for (const state of states) {
      for (const event of events) {
        const decision = evaluateScheduleRevisionTransition({ state, event });
        const next = expected.get(`${state}:${event}`);

        if (next === undefined) {
          expect(decision).toEqual({
            tag: 'err',
            error: {
              code: 'SCHEDULE_EVENT_NOT_ALLOWED',
              message: 'The schedule revision event is not allowed.',
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
    ['draft', ['accept', 'supersede', 'reject']],
    ['accepted', ['supersede']],
    ['superseded', []],
    ['rejected', []],
    ['unknown', []],
  ] as const)('exposes allowed events for %s', (state, allowed) => {
    expect(allowedScheduleRevisionEvents(state)).toEqual(allowed);
  });

  it('publishes the exact graph and runtime initial state', () => {
    expect(initialScheduleRevisionState).toBe('draft');
    expect(scheduleRevisionGraph).toEqual([
      {
        from: 'draft',
        event: 'accept',
        to: 'accepted',
        description: 'Accept a current, actionable schedule revision.',
      },
      {
        from: 'draft',
        event: 'supersede',
        to: 'superseded',
        description:
          'Retire a current revision when its planning truth changes.',
      },
      {
        from: 'accepted',
        event: 'supersede',
        to: 'superseded',
        description:
          'Retire a current revision when its planning truth changes.',
      },
      {
        from: 'draft',
        event: 'reject',
        to: 'rejected',
        description: 'Reject a draft revision without making it actionable.',
      },
    ]);
  });
});

describe('production run lifecycle', () => {
  it('defines the complete state-event matrix', () => {
    expect(
      evaluateProductionRunTransition({
        state: 'started',
        event: 'complete_final_batch',
      }),
    ).toEqual({
      tag: 'ok',
      value: { from: 'started', state: 'completed' },
    });
    expect(
      evaluateProductionRunTransition({
        state: 'completed',
        event: 'complete_final_batch',
      }),
    ).toEqual({
      tag: 'err',
      error: {
        code: 'PRODUCTION_RUN_EVENT_NOT_ALLOWED',
        message: 'The production run event is not allowed.',
      },
    });
  });

  it.each([
    ['started', ['complete_final_batch']],
    ['completed', []],
    ['planned', []],
  ] as const)('exposes allowed events for %s', (state, expected) => {
    expect(allowedProductionRunEvents(state)).toEqual(expected);
  });

  it('publishes the exact graph and runtime initial state', () => {
    expect(initialProductionRunState).toBe('started');
    expect(productionRunGraph).toEqual([
      {
        from: 'started',
        event: 'complete_final_batch',
        to: 'completed',
        description:
          'Complete the run atomically when its final batch completes.',
      },
    ]);
  });
});
