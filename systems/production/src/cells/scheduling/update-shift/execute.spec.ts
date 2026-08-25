import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { updateShiftCellDeclaration } from './cell.ts';
import { productionRules } from '../../../model/public.ts';
import { makeExecuteUpdateShift } from './execute.ts';
import type {
  UpdateShiftIdempotency,
  UpdateShiftRepository,
  UpdateShiftTransactionRepository,
  UpdateShiftWorkEventInput,
} from './execute.ts';
import type {
  ProductionShift,
  UpdateShiftCommand,
  UpdateShiftResult,
} from './types.ts';

type Stored = Readonly<{ key: string }>;

const command: UpdateShiftCommand = {
  locationId: 'location-1',
  productionShiftId: '10000000-0000-4000-8000-000000000001',
  startsAt: '2026-08-22T12:30:00.000Z',
  endsAt: '2026-08-22T22:00:00.000Z',
  effectiveFolderCount: 4,
  expectedVersion: 1,
  actorId: '10000000-0000-4000-8000-000000000002',
  idempotencyKey: 'update-shift-command-1',
};

const current: ProductionShift = {
  id: command.productionShiftId,
  locationId: command.locationId,
  startsAt: '2026-08-22T13:00:00.000Z',
  endsAt: '2026-08-22T21:00:00.000Z',
  timezone: 'America/New_York',
  effectiveFolderCount: 2,
  status: 'open',
  version: 1,
};

const updated: ProductionShift = {
  ...current,
  startsAt: command.startsAt,
  endsAt: command.endsAt,
  effectiveFolderCount: command.effectiveFolderCount,
  version: 2,
};

const missIdempotency: UpdateShiftIdempotency<Stored> = {
  resolveReplay: () => ({ kind: 'miss' }),
};

const makeHarness = (
  overrides: Partial<UpdateShiftTransactionRepository<Stored>> = {},
) => {
  const calls: string[] = [];
  const events: UpdateShiftWorkEventInput[] = [];
  const operations: UpdateShiftTransactionRepository<Stored> = {
    findWorkEvent: async () => {
      calls.push('find-work-event');
      return null;
    },
    lockLocationScheduling: async () => {
      calls.push('lock-location');
    },
    lockShift: async () => {
      calls.push('lock-shift');
      return current;
    },
    productionRunExists: async () => {
      calls.push('load-run');
      return false;
    },
    updateShift: async () => {
      calls.push('update-shift');
      return updated;
    },
    lockCurrentSchedule: async () => {
      calls.push('lock-schedule');
      return { scheduleRunId: 'schedule-1', status: 'accepted' };
    },
    supersedeCurrentSchedule: async () => {
      calls.push('supersede-schedule');
      return { kind: 'superseded', scheduleRunId: 'schedule-1' };
    },
    appendWorkEvent: async (event) => {
      calls.push('append-work-event');
      events.push(event);
    },
    ...overrides,
  };
  const repo: UpdateShiftRepository<Stored> = {
    transaction: async (work) => {
      calls.push('transaction-start');
      const outcome = await work(operations);
      calls.push(
        outcome.kind === 'success'
          ? 'transaction-commit'
          : 'transaction-rollback',
      );
      return outcome;
    },
  };
  return {
    calls,
    events,
    repo,
  };
};

describe('execute update shift', () => {
  it('rejects an invalid window before transaction or clock effects', async () => {
    const harness = makeHarness();
    const clock = { now: vi.fn(() => new Date(0)) };
    const run = makeExecuteUpdateShift({
      repo: harness.repo,
      idempotency: missIdempotency,
      policy: productionRules,
      clock,
    });
    await expect(
      run({ ...command, endsAt: command.startsAt }),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_shift_window_invalid' },
    });
    expect(harness.calls).toEqual([]);
    expect(clock.now).not.toHaveBeenCalled();
  });

  proveOperation({
    operationId: 'production.update-shift.v1',
    declaration: updateShiftCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'double-checks replay preserves lock order audits commits then signals',
        proves: ['executor-success'],
        run: async () => {
          const harness = makeHarness();
          const planSuperseded = vi.fn(() =>
            harness.calls.push('signal-plan-superseded'),
          );
          const run = makeExecuteUpdateShift({
            repo: harness.repo,
            idempotency: missIdempotency,
            policy: productionRules,
            clock: { now: () => new Date('2026-08-22T12:00:00.000Z') },
            signals: { planSuperseded },
          });

          await expect(run(command)).resolves.toEqual({
            kind: 'success',
            value: {
              productionShift: updated,
              supersededScheduleRunId: 'schedule-1',
              replayed: false,
            },
          });
          expect(harness.calls).toEqual([
            'transaction-start',
            'find-work-event',
            'lock-location',
            'find-work-event',
            'lock-shift',
            'load-run',
            'update-shift',
            'lock-schedule',
            'supersede-schedule',
            'append-work-event',
            'transaction-commit',
            'signal-plan-superseded',
          ]);
          expect(harness.events).toEqual([
            expect.objectContaining({
              eventType: 'production_shift_updated',
              entityId: command.productionShiftId,
              expectedVersion: 1,
              payload: {
                changedFields: ['startsAt', 'endsAt', 'effectiveFolderCount'],
                previous: {
                  startsAt: current.startsAt,
                  endsAt: current.endsAt,
                  effectiveFolderCount: 2,
                  version: 1,
                },
                current: {
                  startsAt: updated.startsAt,
                  endsAt: updated.endsAt,
                  effectiveFolderCount: 4,
                  version: 2,
                },
                supersededScheduleRunId: 'schedule-1',
              },
            }),
          ]);
          expect(planSuperseded).toHaveBeenCalledOnce();
        },
      },
    ],
  });

  it('records a no-op audit without update, schedule lock, or signal', async () => {
    const harness = makeHarness();
    const planSuperseded = vi.fn();
    const clock = { now: vi.fn(() => new Date(0)) };
    const run = makeExecuteUpdateShift({
      repo: harness.repo,
      idempotency: missIdempotency,
      policy: productionRules,
      clock,
      signals: { planSuperseded },
    });
    const noOp = {
      ...command,
      startsAt: current.startsAt,
      endsAt: current.endsAt,
      effectiveFolderCount: current.effectiveFolderCount,
    };

    await expect(run(noOp)).resolves.toEqual({
      kind: 'success',
      value: {
        productionShift: current,
        supersededScheduleRunId: null,
        replayed: false,
      },
    });
    expect(harness.calls).not.toContain('update-shift');
    expect(harness.calls).not.toContain('lock-schedule');
    expect(harness.events[0]?.payload.changedFields).toEqual([]);
    expect(clock.now).toHaveBeenCalledOnce();
    expect(planSuperseded).not.toHaveBeenCalled();
  });

  it('returns replay before or after the location lock without signal', async () => {
    const replayResult: UpdateShiftResult = {
      productionShift: updated,
      supersededScheduleRunId: 'schedule-1',
      replayed: true,
    };
    for (const sequence of [
      [{ kind: 'replay' as const, result: replayResult }],
      [
        { kind: 'miss' as const },
        { kind: 'replay' as const, result: replayResult },
      ],
    ]) {
      const harness = makeHarness();
      let index = 0;
      const planSuperseded = vi.fn();
      const run = makeExecuteUpdateShift({
        repo: harness.repo,
        idempotency: {
          resolveReplay: () => sequence[index++] ?? { kind: 'miss' },
        },
        policy: productionRules,
        clock: { now: () => new Date(0) },
        signals: { planSuperseded },
      });
      await expect(run(command)).resolves.toEqual({
        kind: 'success',
        value: replayResult,
      });
      expect(harness.calls).not.toContain('lock-shift');
      expect(planSuperseded).not.toHaveBeenCalled();
    }
  });

  it.each([
    {
      name: 'missing shift',
      overrides: { lockShift: async () => null },
      code: 'production_shift_not_found',
    },
    {
      name: 'stale version',
      overrides: { lockShift: async () => ({ ...current, version: 2 }) },
      code: 'production_shift_version_conflict',
    },
    {
      name: 'closed shift',
      overrides: {
        lockShift: async () => ({ ...current, status: 'closed' as const }),
      },
      code: 'production_shift_closed',
    },
    {
      name: 'existing run',
      overrides: { productionRunExists: async () => true },
      code: 'production_shift_already_started',
    },
    {
      name: 'shift CAS conflict',
      overrides: { updateShift: async () => null },
      code: 'production_shift_version_conflict',
    },
    {
      name: 'schedule CAS conflict',
      overrides: {
        supersedeCurrentSchedule: async () => ({ kind: 'conflict' as const }),
      },
      code: 'production_shift_schedule_version_conflict',
    },
  ])('returns $name as typed failure without signaling', async (testCase) => {
    const harness = makeHarness(testCase.overrides);
    const planSuperseded = vi.fn();
    const run = makeExecuteUpdateShift({
      repo: harness.repo,
      idempotency: missIdempotency,
      policy: productionRules,
      clock: { now: () => new Date(0) },
      signals: { planSuperseded },
    });
    await expect(run(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: testCase.code },
    });
    expect(harness.calls).not.toContain('transaction-commit');
    expect(planSuperseded).not.toHaveBeenCalled();
  });

  it('maps unexpected repository failure to the stable unavailable error', async () => {
    const fault = Object.freeze({ fixture: 'database unavailable' });
    const run = makeExecuteUpdateShift({
      repo: {
        transaction: async () => {
          throw fault;
        },
      },
      idempotency: missIdempotency,
      policy: productionRules,
      clock: { now: () => new Date(0) },
    });
    await expect(run(command)).rejects.toMatchObject({
      code: 'production_shift_update_failed',
      status: 503,
      safeMessage: 'The production shift could not be updated.',
    });
  });
});
