import { describe, expect, it } from 'vitest';
import {
  evaluateStageNextAction,
  evaluateStageTransition,
} from '../../src/stage-transition/stage-transition.policy.ts';

const plannedStartAt = new Date('2026-07-10T14:00:00.000Z');
const plannedEndAt = new Date('2026-07-10T14:56:00.000Z');
const context = {
  now: plannedStartAt,
  productionRunStarted: true,
  previousStageCompleted: true,
  sameKindAlreadyActive: false,
  machinesRequired: false,
  assignedMachineIds: [],
  overlappingMachineIds: [],
} as const;

describe('stage transition policy', () => {
  it('starts on the boundary and completes on the next boundary', () => {
    expect(
      evaluateStageTransition(
        { state: 'planned', plannedStartAt, plannedEndAt, actualStartAt: null },
        { type: 'start' },
        context,
      ),
    ).toEqual({
      tag: 'ok',
      value: { status: 'allowed', state: 'started' },
    });
    expect(
      evaluateStageTransition(
        {
          state: 'started',
          plannedStartAt,
          plannedEndAt,
          actualStartAt: plannedStartAt,
        },
        { type: 'complete' },
        { ...context, now: plannedEndAt },
      ),
    ).toEqual({
      tag: 'ok',
      value: { status: 'allowed', state: 'completed' },
    });
  });

  it('rejects early starts and requires confirmation for early completion', () => {
    expect(
      evaluateStageTransition(
        { state: 'planned', plannedStartAt, plannedEndAt, actualStartAt: null },
        { type: 'start' },
        { ...context, now: new Date('2026-07-10T13:59:59.999Z') },
      ),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'STAGE_BOUNDARY_NOT_REACHED' },
    });
    expect(
      evaluateStageTransition(
        {
          state: 'started',
          plannedStartAt,
          plannedEndAt,
          actualStartAt: plannedStartAt,
        },
        { type: 'complete' },
        { ...context, now: new Date('2026-07-10T14:55:59.999Z') },
      ),
    ).toEqual({
      tag: 'ok',
      value: {
        status: 'confirmation_required',
        action: 'complete',
        code: 'PULSE_BOUNDARY_NOT_REACHED',
        message:
          'This stage has not yet occupied its planned production pulse.',
        timing: {
          actualStartAt: plannedStartAt.toISOString(),
          plannedEndAt: plannedEndAt.toISOString(),
          completionBoundaryAt: plannedEndAt.toISOString(),
          observedAt: '2026-07-10T14:55:59.999Z',
          plannedDurationMilliseconds: 56 * 60_000,
          elapsedMilliseconds: 56 * 60_000 - 1,
          remainingMilliseconds: 1,
        },
      },
    });
  });

  it('requires a full pulse after a late physical start', () => {
    const lateStart = new Date('2026-07-10T14:10:00.000Z');
    expect(
      evaluateStageTransition(
        {
          state: 'started',
          plannedStartAt,
          plannedEndAt,
          actualStartAt: lateStart,
        },
        { type: 'complete' },
        { ...context, now: plannedEndAt },
      ),
    ).toMatchObject({
      tag: 'ok',
      value: {
        status: 'confirmation_required',
        code: 'PULSE_BOUNDARY_NOT_REACHED',
        timing: {
          completionBoundaryAt: '2026-07-10T15:06:00.000Z',
          elapsedMilliseconds: 46 * 60_000,
          remainingMilliseconds: 10 * 60_000,
        },
      },
    });
    expect(
      evaluateStageTransition(
        {
          state: 'started',
          plannedStartAt,
          plannedEndAt,
          actualStartAt: lateStart,
        },
        { type: 'complete' },
        { ...context, now: new Date('2026-07-10T15:06:00.000Z') },
      ),
    ).toEqual({
      tag: 'ok',
      value: { status: 'allowed', state: 'completed' },
    });
  });

  it('rejects a stage before its production run starts', () => {
    expect(
      evaluateStageTransition(
        { state: 'planned', plannedStartAt, plannedEndAt, actualStartAt: null },
        { type: 'start' },
        { ...context, productionRunStarted: false },
      ),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'PRODUCTION_RUN_NOT_STARTED' },
    });
  });

  it('rejects missing or overlapping machine assignments', () => {
    expect(
      evaluateStageTransition(
        { state: 'planned', plannedStartAt, plannedEndAt, actualStartAt: null },
        { type: 'start' },
        { ...context, machinesRequired: true },
      ),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'MACHINE_ASSIGNMENT_REQUIRED' },
    });
    expect(
      evaluateStageTransition(
        { state: 'planned', plannedStartAt, plannedEndAt, actualStartAt: null },
        { type: 'start' },
        {
          ...context,
          machinesRequired: true,
          assignedMachineIds: ['machine-1'],
          overlappingMachineIds: ['machine-1'],
        },
      ),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'MACHINE_ASSIGNMENT_OVERLAPS' },
    });
  });
});

describe('stage next-action projection', () => {
  it('returns an exact availability timestamp before a planned boundary', () => {
    expect(
      evaluateStageNextAction(
        { state: 'planned', plannedStartAt, plannedEndAt, actualStartAt: null },
        { ...context, now: new Date('2026-07-10T13:59:59.999Z') },
      ),
    ).toEqual({
      tag: 'ok',
      value: {
        state: 'blocked',
        action: 'start',
        code: 'STAGE_BOUNDARY_NOT_REACHED',
        message: 'A stage cannot start before its planned boundary.',
        availableAt: plannedStartAt.toISOString(),
      },
    });
  });

  it('returns confirmation timing after a late actual start', () => {
    const actualStartAt = new Date('2026-07-10T14:10:00.000Z');
    expect(
      evaluateStageNextAction(
        { state: 'started', plannedStartAt, plannedEndAt, actualStartAt },
        { ...context, now: plannedEndAt },
      ),
    ).toEqual({
      tag: 'ok',
      value: {
        state: 'confirmation_required',
        action: 'complete',
        code: 'PULSE_BOUNDARY_NOT_REACHED',
        message:
          'This stage has not yet occupied its planned production pulse.',
        availableAt: '2026-07-10T15:06:00.000Z',
        timing: {
          actualStartAt: '2026-07-10T14:10:00.000Z',
          plannedEndAt: '2026-07-10T14:56:00.000Z',
          completionBoundaryAt: '2026-07-10T15:06:00.000Z',
          observedAt: '2026-07-10T14:56:00.000Z',
          plannedDurationMilliseconds: 56 * 60_000,
          elapsedMilliseconds: 46 * 60_000,
          remainingMilliseconds: 10 * 60_000,
        },
      },
    });
  });

  it('exposes non-temporal blocks without inventing a timestamp', () => {
    expect(
      evaluateStageNextAction(
        { state: 'planned', plannedStartAt, plannedEndAt, actualStartAt: null },
        { ...context, previousStageCompleted: false },
      ),
    ).toMatchObject({
      tag: 'ok',
      value: {
        state: 'blocked',
        action: 'start',
        code: 'PREVIOUS_STAGE_INCOMPLETE',
        availableAt: null,
      },
    });
  });

  it('returns available and terminal states without a second policy path', () => {
    expect(
      evaluateStageNextAction(
        { state: 'planned', plannedStartAt, plannedEndAt, actualStartAt: null },
        context,
      ),
    ).toEqual({
      tag: 'ok',
      value: { state: 'available', action: 'start' },
    });
    expect(
      evaluateStageNextAction(
        {
          state: 'completed',
          plannedStartAt,
          plannedEndAt,
          actualStartAt: plannedStartAt,
        },
        context,
      ),
    ).toEqual({
      tag: 'ok',
      value: { state: 'terminal', reason: 'stage_completed' },
    });
  });

  it('fails invalid clocks instead of presenting an operational block', () => {
    expect(
      evaluateStageNextAction(
        { state: 'planned', plannedStartAt, plannedEndAt, actualStartAt: null },
        { ...context, now: new Date(Number.NaN) },
      ),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'STAGE_CLOCK_INVALID' },
    });
  });
});
