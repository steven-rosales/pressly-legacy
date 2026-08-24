import { proveOperation } from '@pressly/testkit/operation-proof';
import { createScheduleCellDeclaration } from './cell.ts';
import { describe, expect, it, vi } from 'vitest';
import { invariantViolationError } from '@pressly/errors/factories';
import { productionRules } from '../../../model/public.ts';
import type {
  ScheduleProposal,
  SchedulingInput,
  SchedulingOutput,
} from '../../../model/production-schedule/model.ts';
import {
  makeExecuteCreateSchedule,
  type CreateScheduleRepository,
  type CreateScheduleTransactionRepository,
} from './execute.ts';
import type { CreateScheduleCommand } from './types.ts';
type Stored = { key: string };
const command: CreateScheduleCommand = {
  locationId: 'location',
  productionShiftId: 'shift',
  schedulerConfigId: 'config',
  idempotencyKey: 'schedule-key',
  actorId: 'actor',
};
const input: SchedulingInput = {
  orders: [
    {
      id: 'order',
      externalOrderId: 'ORDER',
      dueAt: '2026-08-22T20:00:00.000Z',
      priority: false,
      derivedWeightLbs: 20,
      bagCount: 1,
      version: 1,
    },
  ],
  machines: [],
  shift: {
    id: 'shift',
    startsAt: '2026-08-22T13:00:00.000Z',
    endsAt: '2026-08-22T21:00:00.000Z',
    timezone: 'America/New_York',
    effectiveFolderCount: 2,
    version: 1,
  },
  config: {
    id: 'config',
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    version: 1,
  },
};
const output: SchedulingOutput = {
  algorithmVersion: 'fixed-pulse-ffd-v2',
  inputSnapshotHash: 'a'.repeat(64),
  outputPlanHash: 'b'.repeat(64),
  canonicalOutput: '{}',
  pulseMinutes: 56,
  pulseCapacityLbs: 100,
  batchCount: 0,
  makespanMinutes: 0,
  plannedCompletionAt: '2026-08-22T21:00:00.000Z',
  batches: [],
  unplacedOrderIds: [],
  warnings: [],
};
const proposal: ScheduleProposal = {
  scheduleRunId: 'schedule',
  productionShiftId: 'shift',
  schedulerConfigId: 'config',
  status: 'draft',
  inputSnapshotHash: output.inputSnapshotHash,
  outputPlanHash: output.outputPlanHash,
  algorithmVersion: 'fixed-pulse-ffd-v2',
  pulseMinutes: 56,
  pulseCapacityLbs: 100,
  batchCount: 0,
  makespanMinutes: 0,
  plannedCompletionAt: output.plannedCompletionAt,
  batches: [],
  unplacedOrderIds: [],
  warnings: [],
  createdAt: '2026-08-22T12:00:00.000Z',
  acceptedAt: null,
  acceptedBy: null,
  acknowledgedWarningCodes: [],
  supersededAt: null,
};
const harness = (
  options: {
    current?: boolean;
    saveConflict?: boolean;
    state?: 'available' | 'not_found' | 'run_exists';
    input?: SchedulingInput | 'selection_empty' | 'selection_invalid' | null;
  } = {},
) => {
  const calls: string[] = [];
  const tx: CreateScheduleTransactionRepository<Stored> = {
    findWorkEvent: async () => {
      calls.push('replay');
      return null;
    },
    lockLocationScheduling: async () => {
      calls.push('lock-location');
    },
    lockShiftForPlanning: async () => {
      calls.push('lock-shift');
      return options.state ?? 'available';
    },
    loadSchedulingInput: async () => {
      calls.push('load-input');
      return options.input === undefined ? input : options.input;
    },
    loadCurrentPlan: async () => {
      calls.push('lock-plan');
      return options.current === true
        ? { scheduleRunId: 'old', status: 'accepted' }
        : null;
    },
    saveSchedule: async () => {
      calls.push('save');
      return options.saveConflict === true
        ? { kind: 'conflict' }
        : { kind: 'saved', proposal };
    },
    appendWorkEvent: async () => {
      calls.push('event');
    },
  };
  const repo: CreateScheduleRepository<Stored> = {
    transaction: async (work) => {
      calls.push('tx-start');
      const value = await work(tx);
      calls.push(value.kind === 'success' ? 'tx-ok' : 'tx-err');
      return value;
    },
  };
  return { calls, repo };
};
const make = (
  h: ReturnType<typeof harness>,
  extra: Partial<Parameters<typeof makeExecuteCreateSchedule<Stored>>[0]> = {},
) =>
  makeExecuteCreateSchedule({
    repo: h.repo,
    idempotency: { resolveReplay: () => ({ kind: 'miss' }) },
    scheduler: { propose: () => output },
    policy: productionRules,
    clock: { now: () => new Date('2026-08-22T12:00:00.000Z') },
    ids: { next: () => 'schedule' },
    ...extra,
  });
describe('execute create schedule', () => {
  proveOperation({
    operationId: 'production.create-schedule.v1',
    declaration: createScheduleCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'preserves double replay, lock order, scheduler seam, audit, commit, then signal',
        proves: ['executor-success'],
        run: async () => {
          const h = harness({ current: true });
          const signal = vi.fn(() => h.calls.push('signal'));
          await expect(
            make(h, { signals: { planSuperseded: signal } })(command),
          ).resolves.toEqual({ kind: 'success', value: proposal });
          expect(h.calls).toEqual([
            'tx-start',
            'replay',
            'lock-location',
            'replay',
            'lock-shift',
            'load-input',
            'lock-plan',
            'save',
            'event',
            'tx-ok',
            'signal',
          ]);
        },
      },
    ],
  });
  it.each([
    { state: 'not_found' as const, code: 'production_shift_not_found' },
    { state: 'run_exists' as const, code: 'production_shift_already_started' },
    { input: null, code: 'scheduling_input_not_found' },
    { input: 'selection_empty' as const, code: 'schedule_selection_empty' },
    {
      input: 'selection_invalid' as const,
      code: 'schedule_selection_not_ready',
    },
    {
      saveConflict: true,
      code: 'production_schedule_revision_version_conflict',
    },
  ])('returns $code without signal', async (test) => {
    const h = harness(test);
    const signal = vi.fn();
    await expect(
      make(h, { signals: { planSuperseded: signal } })(command),
    ).resolves.toMatchObject({ kind: 'failure', failure: { code: test.code } });
    expect(signal).not.toHaveBeenCalled();
  });
  it('does not signal a new plan or replay', async () => {
    const h = harness();
    const signal = vi.fn();
    await make(h, { signals: { planSuperseded: signal } })(command);
    expect(signal).not.toHaveBeenCalled();
    const replay = {
      ...proposal,
      algorithmVersion: 'fixed-pulse-ffd-v1' as const,
    };
    const h2 = harness();
    await make(h2, {
      idempotency: {
        resolveReplay: () => ({ kind: 'replay', result: replay }),
      },
      signals: { planSuperseded: signal },
    })(command);
    expect(signal).not.toHaveBeenCalled();
    expect(h2.calls).not.toContain('lock-location');
  });
  it('normalizes an unknown post-commit plan-superseded signal fault', async () => {
    const h = harness({ current: true });
    const fault = { signal: 'failed' };

    await expect(
      make(h, {
        signals: {
          planSuperseded: () => {
            throw fault;
          },
        },
      })(command),
    ).rejects.toMatchObject({
      code: 'schedule_create_failed',
      status: 503,
      cause: fault,
    });
    expect(h.calls.at(-1)).toBe('tx-ok');
  });
  it('preserves owned AppErrors and maps unknown faults', async () => {
    const owned = invariantViolationError({
      code: 'owned',
      message: 'owned',
      safeMessage: 'owned',
    });
    const unknown = { fixture: true };
    for (const [fault, code] of [
      [owned, 'owned'],
      [unknown, 'schedule_create_failed'],
    ] as const) {
      const run = makeExecuteCreateSchedule({
        repo: {
          transaction: async () => {
            throw fault;
          },
        },
        idempotency: { resolveReplay: () => ({ kind: 'miss' }) },
        scheduler: { propose: () => output },
        policy: productionRules,
        clock: { now: () => new Date() },
        ids: { next: () => 'id' },
      });
      await expect(run(command)).rejects.toMatchObject({ code });
    }
  });
});
