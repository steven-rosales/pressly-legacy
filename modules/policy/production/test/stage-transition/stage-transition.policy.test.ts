import { describe, expect, it } from 'vitest';
import { evaluateStageTransition } from '../../src/stage-transition/stage-transition.policy.ts';

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
    ).toEqual({ tag: 'ok', value: { state: 'started' } });
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
    ).toEqual({ tag: 'ok', value: { state: 'completed' } });
  });

  it('rejects early starts and early physical completion', () => {
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
    ).toMatchObject({
      tag: 'err',
      error: { code: 'PULSE_BOUNDARY_NOT_REACHED' },
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
      tag: 'err',
      error: { code: 'PULSE_BOUNDARY_NOT_REACHED' },
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
    ).toEqual({ tag: 'ok', value: { state: 'completed' } });
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
