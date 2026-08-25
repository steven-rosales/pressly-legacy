import { proveOperation } from '@pressly/testkit/operation-proof';
import { acceptScheduleCellDeclaration } from './cell.ts';
import { databaseError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import {
  makeExecuteAcceptSchedule,
  type AcceptScheduleTransactionRepository,
  type AcceptScheduleWorkEventCommand,
} from './execute.ts';
import {
  acceptScheduleIdempotency,
  serializeAcceptScheduleWorkEventCommand,
  type StoredAcceptScheduleWorkEvent,
} from './idempotency.ts';
import type {
  AcceptScheduleCommand,
  AcceptScheduleResult,
  ScheduleAcceptanceRecord,
} from './types.ts';

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  shift: '10000000-0000-4000-8000-000000000002',
  schedule: '10000000-0000-4000-8000-000000000003',
  config: '10000000-0000-4000-8000-000000000004',
  order: '10000000-0000-4000-8000-000000000005',
} as const;
const outputHash = 'a'.repeat(64);
const now = new Date('2026-08-22T14:00:00.000Z');

const acceptanceRecord = (
  overrides: Partial<ScheduleAcceptanceRecord> = {},
): ScheduleAcceptanceRecord => {
  const stages = [
    ['sorting', 13, 14],
    ['washing', 14, 15],
    ['drying', 15, 16],
    ['folding_packaging', 16, 17],
  ] as const;
  const base: ScheduleAcceptanceRecord = {
    schedule: {
      scheduleRunId: ids.schedule,
      productionShiftId: ids.shift,
      schedulerConfigId: ids.config,
      status: 'draft',
      inputSnapshotHash: 'b'.repeat(64),
      outputPlanHash: outputHash,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      pulseMinutes: 60,
      pulseCapacityLbs: 100,
      batchCount: 1,
      makespanMinutes: 300,
      plannedCompletionAt: '2026-08-22T17:00:00.000Z',
      batches: [
        {
          sequence: 0,
          orderIds: [ids.order],
          derivedWeightLbs: 20,
          bagCount: 1,
          stages: stages.map(([stage, starts, ends]) => ({
            stage,
            startsAt: `2026-08-22T${String(starts).padStart(2, '0')}:00:00.000Z`,
            endsAt: `2026-08-22T${String(ends).padStart(2, '0')}:00:00.000Z`,
            machineIds: [],
          })),
        },
      ],
      unplacedOrderIds: [],
      warnings: [
        {
          code: 'SHIFT_OVERFLOW',
          message: 'Overflow.',
          blocking: true,
        },
        {
          code: 'OVERSIZED_ORDER',
          message: 'Oversized.',
          blocking: true,
          orderIds: [ids.order],
        },
      ],
      createdAt: '2026-08-22T12:00:00.000Z',
      acceptedAt: null,
      acceptedBy: null,
      acknowledgedWarningCodes: [],
      supersededAt: null,
    },
    inputSnapshot: {
      orders: [
        {
          id: ids.order,
          externalOrderId: 'ORDER-1',
          dueAt: '2026-08-22T20:00:00.000Z',
          priority: false,
          derivedWeightLbs: 20,
          bagCount: 1,
          version: 1,
        },
      ],
      machines: [],
      shift: {
        id: ids.shift,
        startsAt: '2026-08-22T13:00:00.000Z',
        endsAt: '2026-08-22T21:00:00.000Z',
        timezone: 'America/New_York',
        effectiveFolderCount: 2,
        version: 1,
      },
      config: {
        id: ids.config,
        pulseMinutes: 60,
        foldLbsPerFolderMinute: 2,
        algorithmVersion: 'fixed-pulse-ffd-v2',
        version: 1,
      },
    },
  };
  return { ...base, ...overrides };
};

const command = (
  overrides: Partial<AcceptScheduleCommand> = {},
): AcceptScheduleCommand => ({
  locationId: 'location-1',
  scheduleRunId: ids.schedule,
  expectedOutputPlanHash: outputHash,
  acknowledgedWarningCodes: ['SHIFT_OVERFLOW', 'OVERSIZED_ORDER'],
  idempotencyKey: 'accept-schedule-command-1',
  actorId: ids.actor,
  ...overrides,
});

const accepted: AcceptScheduleResult = {
  scheduleRunId: ids.schedule,
  productionShiftId: ids.shift,
  acceptedAt: now.toISOString(),
  replayed: false,
};

const identity = (
  overrides: Partial<AcceptScheduleWorkEventCommand> = {},
): AcceptScheduleWorkEventCommand => ({
  operation: 'schedule_accepted',
  locationId: 'location-1',
  actorId: ids.actor,
  target: { entityType: 'schedule_run', entityId: ids.schedule },
  expectedVersion: null,
  payload: {
    expectedOutputPlanHash: outputHash,
    acknowledgedWarningCodes: ['SHIFT_OVERFLOW', 'OVERSIZED_ORDER'],
  },
  ...overrides,
});

const transactionRepository = (
  overrides: Partial<
    AcceptScheduleTransactionRepository<StoredAcceptScheduleWorkEvent>
  > = {},
) => ({
  findWorkEvent: vi.fn(async () => null),
  lockLocationScheduling: vi.fn(async () => undefined),
  loadSchedule: vi.fn(async () => acceptanceRecord()),
  productionRunExists: vi.fn(async () => false),
  lockAndValidateScheduleInput: vi.fn(async () => true),
  acceptSchedule: vi.fn(async () => ({
    kind: 'accepted' as const,
    result: accepted,
  })),
  ...overrides,
});

const harness = (
  tx: AcceptScheduleTransactionRepository<StoredAcceptScheduleWorkEvent>,
) => {
  const transaction = vi.fn(async (work) => work(tx));
  const clock = { now: vi.fn(() => now) };
  return {
    execute: makeExecuteAcceptSchedule({
      repo: { transaction },
      idempotency: acceptScheduleIdempotency,
      policy: productionRules,
      clock,
    }),
    transaction,
    clock,
  };
};

describe('accept schedule executor', () => {
  proveOperation({
    operationId: 'production.accept-schedule.v1',
    declaration: acceptScheduleCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'preserves replay, lock, row, policy, snapshot, and atomic accept order',
        proves: ['executor-success'],
        run: async () => {
          const trace: string[] = [];
          let reads = 0;
          const tx = transactionRepository({
            findWorkEvent: vi.fn(async () => {
              trace.push(`find-work-event:${String(++reads)}`);
              return null;
            }),
            lockLocationScheduling: vi.fn(async () => {
              trace.push('lock:location');
            }),
            loadSchedule: vi.fn(async () => {
              trace.push('lock:schedule');
              return acceptanceRecord();
            }),
            productionRunExists: vi.fn(async () => {
              trace.push('read:production-run');
              return false;
            }),
            lockAndValidateScheduleInput: vi.fn(async () => {
              trace.push('lock:orders');
              return true;
            }),
            acceptSchedule: vi.fn(async () => {
              trace.push('accept-and-receipt');
              return { kind: 'accepted' as const, result: accepted };
            }),
          });
          const { execute, clock } = harness(tx);
          clock.now.mockImplementation(() => {
            trace.push('clock:now');
            return now;
          });

          await expect(execute(command())).resolves.toEqual({
            kind: 'success',
            value: accepted,
          });
          expect(trace).toEqual([
            'find-work-event:1',
            'lock:location',
            'find-work-event:2',
            'lock:schedule',
            'clock:now',
            'read:production-run',
            'lock:orders',
            'accept-and-receipt',
          ]);
          expect(tx.acceptSchedule).toHaveBeenCalledWith({
            locationId: 'location-1',
            record: acceptanceRecord(),
            actorId: ids.actor,
            acknowledgedWarningCodes: ['SHIFT_OVERFLOW', 'OVERSIZED_ORDER'],
            idempotencyKey: 'accept-schedule-command-1',
            idempotency: identity(),
            lifecycle: { from: 'draft', state: 'accepted' },
            now,
          });
        },
      },
    ],
  });

  it('replays or rejects divergence before the location lock', async () => {
    const stored = {
      command: serializeAcceptScheduleWorkEventCommand(identity()),
      result: accepted,
      valid: true,
    };
    const replayTx = transactionRepository({
      findWorkEvent: vi.fn(async () => stored),
    });
    const replay = harness(replayTx);
    await expect(replay.execute(command())).resolves.toEqual({
      kind: 'success',
      value: { ...accepted, replayed: true },
    });
    expect(replayTx.lockLocationScheduling).not.toHaveBeenCalled();

    const conflictTx = transactionRepository({
      findWorkEvent: vi.fn(async () => stored),
    });
    await expect(
      harness(conflictTx).execute(
        command({
          acknowledgedWarningCodes: ['OVERSIZED_ORDER', 'SHIFT_OVERFLOW'],
        }),
      ),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_idempotency_conflict' },
    });
    expect(conflictTx.lockLocationScheduling).not.toHaveBeenCalled();
  });

  it('replays after the location lock before the schedule row lock', async () => {
    const stored = {
      command: serializeAcceptScheduleWorkEventCommand(identity()),
      result: accepted,
      valid: true,
    };
    const tx = transactionRepository({
      findWorkEvent: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(stored),
    });
    const { execute } = harness(tx);
    await expect(execute(command())).resolves.toEqual({
      kind: 'success',
      value: { ...accepted, replayed: true },
    });
    expect(tx.lockLocationScheduling).toHaveBeenCalledOnce();
    expect(tx.loadSchedule).not.toHaveBeenCalled();
  });

  it('returns not-found before reading the clock', async () => {
    const tx = transactionRepository({
      loadSchedule: vi.fn(async () => null),
    });
    const { execute, clock } = harness(tx);
    await expect(execute(command())).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'schedule_not_found' },
    });
    expect(clock.now).not.toHaveBeenCalled();
    expect(tx.productionRunExists).not.toHaveBeenCalled();
  });

  it('rejects an expired snapshot before run and order reads', async () => {
    const tx = transactionRepository();
    const { execute, clock } = harness(tx);
    clock.now.mockReturnValue(new Date('2026-08-22T21:00:00.000Z'));
    await expect(execute(command())).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_shift_expired' },
    });
    expect(tx.productionRunExists).not.toHaveBeenCalled();
    expect(tx.lockAndValidateScheduleInput).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'existing run',
      tx: { productionRunExists: vi.fn(async () => true) },
      command: command(),
      code: 'production_shift_already_started',
    },
    {
      name: 'non-draft lifecycle',
      tx: {
        loadSchedule: vi.fn(async () =>
          acceptanceRecord({
            schedule: { ...acceptanceRecord().schedule, status: 'accepted' },
          }),
        ),
      },
      command: command(),
      code: 'schedule_not_draft',
    },
    {
      name: 'hash drift',
      tx: {},
      command: command({ expectedOutputPlanHash: 'c'.repeat(64) }),
      code: 'schedule_hash_mismatch',
    },
  ])('rejects $name before locked snapshot validation', async (input) => {
    const tx = transactionRepository(input.tx);
    const { execute } = harness(tx);
    await expect(execute(input.command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: input.code },
    });
    expect(tx.lockAndValidateScheduleInput).not.toHaveBeenCalled();
    expect(tx.acceptSchedule).not.toHaveBeenCalled();
  });

  it('rejects snapshot drift after locking orders and before acceptance', async () => {
    const tx = transactionRepository({
      lockAndValidateScheduleInput: vi.fn(async () => false),
    });
    const { execute } = harness(tx);
    await expect(execute(command())).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'schedule_input_snapshot_stale' },
    });
    expect(tx.acceptSchedule).not.toHaveBeenCalled();
  });

  it('maps the late lifecycle CAS conflict exactly', async () => {
    const tx = transactionRepository({
      acceptSchedule: vi.fn(async () => ({ kind: 'conflict' as const })),
    });
    await expect(harness(tx).execute(command())).resolves.toMatchObject({
      kind: 'failure',
      failure: {
        code: 'production_schedule_already_accepted',
        safeMessage: 'Production state changed. Refresh and try again.',
      },
    });
  });

  it('preserves AppErrors and maps unknown transaction faults exactly', async () => {
    const existing = databaseError({
      code: 'fixture_database_error',
      message: 'Fixture database error.',
      safeMessage: 'Fixture database error.',
      status: 503,
    });
    const preserved = makeExecuteAcceptSchedule({
      repo: {
        transaction: vi.fn(async () => {
          throw existing;
        }),
      },
      idempotency: acceptScheduleIdempotency,
      policy: productionRules,
      clock: { now: () => now },
    });
    await expect(preserved(command())).rejects.toBe(existing);

    const fault = { fixture: 'unknown accept failure' };
    const mapped = makeExecuteAcceptSchedule({
      repo: {
        transaction: vi.fn(async () => {
          throw fault;
        }),
      },
      idempotency: acceptScheduleIdempotency,
      policy: productionRules,
      clock: { now: () => now },
    });
    await expect(mapped(command())).rejects.toMatchObject({
      kind: 'DatabaseError',
      code: 'schedule_accept_failed',
      status: 503,
      cause: fault,
    });
  });
});
