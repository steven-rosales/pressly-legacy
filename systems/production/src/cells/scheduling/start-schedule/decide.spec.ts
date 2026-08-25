import { proveOperation } from '@pressly/testkit/operation-proof';
import { startScheduleCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import {
  decideScheduleRecord,
  decideStartSchedule,
  decideStartWindow,
} from './decide.ts';
import type {
  ScheduleStartRecord,
  StartScheduleOrder,
  StartSchedulePolicy,
} from './types.ts';

const order: StartScheduleOrder = {
  id: 'order-1',
  operationalStatus: 'eligible',
  executionStatus: 'unassigned',
  version: 3,
};
const record: ScheduleStartRecord = {
  schedule: {
    scheduleRunId: 'schedule-1',
    productionShiftId: 'shift-1',
    status: 'accepted',
    outputPlanHash: 'a'.repeat(64),
    pulseMinutes: 56,
    pulseCapacityLbs: 100,
    plannedCompletionAt: '2026-08-22T20:00:00.000Z',
    batches: [
      {
        sequence: 0,
        orderIds: [order.id],
        derivedWeightLbs: 20,
        bagCount: 1,
        stages: [],
      },
    ],
    unplacedOrderIds: [],
  },
  inputSnapshot: {
    orders: [],
    machines: [],
    shift: {
      id: 'shift-1',
      startsAt: '2026-08-22T14:00:00.000Z',
      endsAt: '2026-08-22T22:00:00.000Z',
      timezone: 'America/New_York',
      effectiveFolderCount: 2,
      version: 1,
    },
    config: {
      id: 'config-1',
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      version: 1,
    },
  },
  acceptedBy: 'actor-1',
  acknowledgedWarningCodes: [],
};

describe('start schedule decisions', () => {
  proveOperation({
    operationId: 'production.start-schedule.v1',
    declaration: startScheduleCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'distinguishes missing schedule, hash drift, and a ready record',
        proves: ['decision'],
        run: () => {
          expect(
            decideScheduleRecord({
              record: null,
              expectedOutputPlanHash: record.schedule.outputPlanHash,
            }),
          ).toMatchObject({
            kind: 'reject',
            failure: { code: 'schedule_not_found' },
          });
          expect(
            decideScheduleRecord({
              record,
              expectedOutputPlanHash: 'different',
            }),
          ).toMatchObject({
            kind: 'reject',
            failure: { code: 'schedule_hash_mismatch' },
          });
          expect(
            decideScheduleRecord({
              record,
              expectedOutputPlanHash: record.schedule.outputPlanHash,
            }),
          ).toEqual({ kind: 'ready', record });
        },
      },
    ],
  });

  it.each([
    ['2026-08-22T13:59:59.999Z', 'production_shift_not_started'],
    ['2026-08-22T22:00:00.000Z', 'production_shift_expired'],
  ])('rejects the start window at %s with %s', (now, code) => {
    expect(
      decideStartWindow({
        record,
        now: new Date(now),
        policy: productionRules,
      }),
    ).toMatchObject({ code });
  });

  it('rejects every reachable aggregate and order lifecycle branch', () => {
    const cases = [
      {
        record: {
          ...record,
          schedule: { ...record.schedule, status: 'draft' },
        },
        lockedOrders: [order],
        productionRunExists: false,
        code: 'schedule_not_accepted',
      },
      {
        record,
        lockedOrders: null,
        productionRunExists: false,
        code: 'schedule_input_snapshot_stale',
      },
      {
        record,
        lockedOrders: [order],
        productionRunExists: true,
        code: 'production_run_already_exists',
      },
      {
        record: {
          ...record,
          schedule: { ...record.schedule, batches: [] },
        },
        lockedOrders: [order],
        productionRunExists: false,
        code: 'schedule_has_no_batches',
      },
      {
        record,
        lockedOrders: [{ ...order, executionStatus: 'scheduled' }],
        productionRunExists: false,
        code: 'production_order_execution_event_not_allowed',
      },
      {
        record,
        lockedOrders: [{ ...order, executionStatus: 'corrupt' }],
        productionRunExists: false,
        code: 'production_order_execution_state_invalid',
      },
    ] as const;
    for (const candidate of cases)
      expect(
        decideStartSchedule({ ...candidate, policy: productionRules }),
      ).toMatchObject({ kind: 'reject', failure: { code: candidate.code } });
  });

  it('preserves defensive stale/transition/state branches from injected policy', () => {
    const allow = {
      ...productionRules,
      evaluateScheduleStart: () => ({ tag: 'ok', value: { started: true } }),
    } as StartSchedulePolicy;
    expect(
      decideStartSchedule({
        record,
        lockedOrders: null,
        productionRunExists: false,
        policy: allow,
      }),
    ).toMatchObject({ failure: { code: 'schedule_input_stale' } });
    const strangeTransition = {
      ...allow,
      resolveProductionOrderExecutionState: () => ({
        tag: 'ok',
        value: 'unassigned',
      }),
      evaluateProductionOrderExecutionTransition: () => ({
        tag: 'ok',
        value: { from: 'scheduled', state: 'finished' },
      }),
    } as unknown as StartSchedulePolicy;
    expect(
      decideStartSchedule({
        record,
        lockedOrders: [order],
        productionRunExists: false,
        policy: strangeTransition,
      }),
    ).toMatchObject({
      failure: { code: 'production_order_execution_transition_invalid' },
    });
    const strangeState = {
      ...allow,
      resolveProductionOrderExecutionState: () => ({
        tag: 'ok',
        value: 'unassigned',
      }),
      evaluateProductionOrderExecutionTransition: () => ({
        tag: 'ok',
        value: { from: 'unassigned', state: 'scheduled' },
      }),
    } as StartSchedulePolicy;
    expect(
      decideStartSchedule({
        record,
        lockedOrders: [{ ...order, executionStatus: 'corrupt' }],
        productionRunExists: false,
        policy: strangeState,
      }),
    ).toMatchObject({
      failure: { code: 'production_order_execution_state_invalid' },
    });
  });

  it('returns every initial state and the exact order mutation', () => {
    expect(
      decideStartSchedule({
        record,
        lockedOrders: [order],
        productionRunExists: false,
        policy: productionRules,
      }),
    ).toEqual({
      kind: 'ready',
      decision: {
        productionRunStatus: 'started',
        initialBatchState: 'queued',
        initialStageState: 'planned',
        initialAttemptState: 'assigned',
        orderLifecycles: [
          {
            productionOrderId: order.id,
            persistedState: 'unassigned',
            expectedVersion: 3,
            lifecycle: { from: 'unassigned', state: 'scheduled' },
          },
        ],
      },
    });
  });
});
