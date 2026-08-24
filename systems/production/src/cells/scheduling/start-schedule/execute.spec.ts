import { proveOperation } from '@pressly/testkit/operation-proof';
import { startScheduleCellDeclaration } from './cell.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import {
  makeExecuteStartSchedule,
  type StartScheduleRepository,
  type StartScheduleTransactionRepository,
} from './execute.ts';
import type {
  ScheduleStartRecord,
  StartScheduleCommand,
  StartScheduleResult,
} from './types.ts';

type Stored = Readonly<{ key: string }>;
const command: StartScheduleCommand = {
  locationId: 'location-1',
  scheduleRunId: 'schedule-1',
  expectedOutputPlanHash: 'a'.repeat(64),
  idempotencyKey: 'start-schedule-1',
  actorId: 'actor-1',
};
const record: ScheduleStartRecord = {
  schedule: {
    scheduleRunId: command.scheduleRunId,
    productionShiftId: 'shift-1',
    status: 'accepted',
    outputPlanHash: command.expectedOutputPlanHash,
    pulseMinutes: 56,
    pulseCapacityLbs: 100,
    plannedCompletionAt: '2026-08-22T20:00:00.000Z',
    batches: [
      {
        sequence: 0,
        orderIds: ['order-1'],
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
  acceptedBy: command.actorId,
  acknowledgedWarningCodes: [],
};
const started: StartScheduleResult = {
  scheduleRunId: command.scheduleRunId,
  productionRunId: 'run-1',
  productionBatchIds: ['batch-1'],
  queueVersion: 1,
  startedAt: '2026-08-22T15:00:00.000Z',
  replayed: false,
};

const harness = (
  options: Readonly<{
    schedule?: ScheduleStartRecord | null;
    shiftExists?: boolean;
    runExists?: boolean;
    lockedOrders?:
      | readonly Readonly<{
          id: string;
          operationalStatus: string;
          executionStatus: string;
          version: number;
        }>[]
      | null;
    commit?: 'started' | 'conflict';
  }> = {},
) => {
  const calls: string[] = [];
  const tx: StartScheduleTransactionRepository<Stored> = {
    findWorkEvent: async () => {
      calls.push('replay');
      return null;
    },
    lockLocationScheduling: async () => {
      calls.push('lock-location');
    },
    loadSchedule: async () => {
      calls.push('lock-schedule');
      return options.schedule === undefined ? record : options.schedule;
    },
    lockShiftForStart: async () => {
      calls.push('lock-shift');
      return options.shiftExists ?? true;
    },
    productionRunExists: async () => {
      calls.push('find-run');
      return options.runExists ?? false;
    },
    lockAndLoadStartOrders: async () => {
      calls.push('lock-orders');
      return options.lockedOrders === undefined
        ? [
            {
              id: 'order-1',
              operationalStatus: 'eligible',
              executionStatus: 'unassigned',
              version: 1,
            },
          ]
        : options.lockedOrders;
    },
    commitStart: async () => {
      calls.push('commit-graph-event');
      return options.commit === 'conflict'
        ? { kind: 'order_conflict' }
        : { kind: 'started', result: started };
    },
  };
  const repo: StartScheduleRepository<Stored> = {
    transaction: async (work) => {
      calls.push('tx-start');
      const outcome = await work(tx);
      calls.push(outcome.kind === 'success' ? 'tx-ok' : 'tx-err');
      return outcome;
    },
  };
  return { calls, repo };
};

const make = (
  target: ReturnType<typeof harness>,
  options: Readonly<{
    resolveReplay?: Parameters<
      typeof makeExecuteStartSchedule<Stored>
    >[0]['idempotency']['resolveReplay'];
    now?: Date;
    signal?: () => void;
  }> = {},
) => {
  const clock = vi.fn(() =>
    options.now === undefined
      ? new Date('2026-08-22T15:00:00.000Z')
      : options.now,
  );
  return {
    clock,
    execute: makeExecuteStartSchedule({
      repo: target.repo,
      idempotency: {
        resolveReplay: options.resolveReplay ?? (() => ({ kind: 'miss' })),
      },
      policy: productionRules,
      clock: { now: clock },
      ...(options.signal === undefined
        ? {}
        : { signals: { runStarted: options.signal } }),
    }),
  };
};

describe('execute start schedule', () => {
  proveOperation({
    operationId: 'production.start-schedule.v1',
    declaration: startScheduleCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'preserves lock, clock, graph/event commit, and after-commit signal order',
        proves: ['executor-success'],
        run: async () => {
          const target = harness();
          const signal = vi.fn(() => target.calls.push('signal'));
          const runner = make(target, { signal });
          await expect(runner.execute(command)).resolves.toEqual({
            kind: 'success',
            value: started,
          });
          expect(runner.clock).toHaveBeenCalledOnce();
          expect(target.calls).toEqual([
            'tx-start',
            'replay',
            'lock-location',
            'replay',
            'lock-schedule',
            'lock-shift',
            'find-run',
            'lock-orders',
            'commit-graph-event',
            'tx-ok',
            'signal',
          ]);
        },
      },
    ],
  });

  it('replays at both checkpoints without clock, graph, or signal', async () => {
    for (const checkpoint of [1, 2]) {
      const target = harness();
      const signal = vi.fn();
      let count = 0;
      const runner = make(target, {
        resolveReplay: () =>
          ++count === checkpoint
            ? { kind: 'replay', result: { ...started, replayed: true } }
            : { kind: 'miss' },
        signal,
      });
      await expect(runner.execute(command)).resolves.toMatchObject({
        kind: 'success',
        value: { replayed: true },
      });
      expect(runner.clock).not.toHaveBeenCalled();
      expect(target.calls).not.toContain('commit-graph-event');
      expect(signal).not.toHaveBeenCalled();
    }
  });

  it('rejects divergent idempotency reuse at both checkpoints', async () => {
    for (const checkpoint of [1, 2]) {
      const target = harness();
      let count = 0;
      await expect(
        make(target, {
          resolveReplay: () =>
            ++count === checkpoint ? { kind: 'conflict' } : { kind: 'miss' },
        }).execute(command),
      ).resolves.toMatchObject({
        kind: 'failure',
        failure: { code: 'production_idempotency_conflict' },
      });
      expect(target.calls).not.toContain('commit-graph-event');
    }
  });

  it.each([
    {
      options: { schedule: null },
      patch: {},
      code: 'schedule_not_found',
      clockReads: 0,
    },
    {
      options: {},
      patch: { expectedOutputPlanHash: 'b'.repeat(64) },
      code: 'schedule_hash_mismatch',
      clockReads: 0,
    },
    {
      options: { shiftExists: false },
      patch: {},
      code: 'production_shift_not_found',
      clockReads: 0,
    },
    {
      options: { runExists: true },
      patch: {},
      code: 'production_run_already_exists',
      clockReads: 1,
    },
    {
      options: { lockedOrders: null },
      patch: {},
      code: 'schedule_input_snapshot_stale',
      clockReads: 1,
    },
    {
      options: { commit: 'conflict' },
      patch: {},
      code: 'production_schedule_start_order_version_conflict',
      clockReads: 1,
    },
  ] as const)('returns $code through typed rollback', async (candidate) => {
    const target = harness(candidate.options);
    const signal = vi.fn();
    const runner = make(target, { signal });
    await expect(
      runner.execute({ ...command, ...candidate.patch }),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: candidate.code },
    });
    expect(runner.clock).toHaveBeenCalledTimes(candidate.clockReads);
    expect(signal).not.toHaveBeenCalled();
  });

  it('uses the one captured clock value for the operating-window rejection', async () => {
    const target = harness();
    const runner = make(target, {
      now: new Date('2026-08-22T13:59:59.999Z'),
    });
    await expect(runner.execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_shift_not_started' },
    });
    expect(runner.clock).toHaveBeenCalledOnce();
    expect(target.calls).not.toContain('find-run');
  });

  it('preserves owned AppErrors and maps unknown persistence faults', async () => {
    const owned = invariantViolationError({
      code: 'owned_start_fault',
      message: 'owned',
      safeMessage: 'owned',
    });
    for (const [fault, code] of [
      [owned, 'owned_start_fault'],
      [{ fixture: true }, 'production_run_start_failed'],
    ] as const) {
      const execute = makeExecuteStartSchedule({
        repo: {
          transaction: async () => {
            throw fault;
          },
        },
        idempotency: { resolveReplay: () => ({ kind: 'miss' }) },
        policy: productionRules,
        clock: { now: () => new Date() },
      });
      await expect(execute(command)).rejects.toMatchObject({ code });
    }
  });
});
