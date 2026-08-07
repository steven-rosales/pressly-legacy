import { describe, expect, it, vi } from 'vitest';
import type { AcceptScheduleRepository } from '../../../src/features/scheduling/accept-schedule/accept-schedule.port.ts';
import { makeAcceptSchedule } from '../../../src/features/scheduling/accept-schedule/accept-schedule.usecase.ts';
import type { CreateScheduleRepository } from '../../../src/features/scheduling/create-schedule/create-schedule.port.ts';
import { makeCreateSchedule } from '../../../src/features/scheduling/create-schedule/create-schedule.usecase.ts';
import type { SchedulingInput } from '../../../src/foundations/language/scheduling/production-scheduling.model.ts';
import type { ScheduleProposal } from '../../../src/foundations/language/scheduling/schedule-proposal.entity.ts';
import type { StartScheduleRepository } from '../../../src/features/scheduling/start-schedule/start-schedule.port.ts';
import { makeStartSchedule } from '../../../src/features/scheduling/start-schedule/start-schedule.usecase.ts';
import { allowPolicy } from '../../support/production.fake.ts';
import { nullProductionSignals } from '../../../src/foundations/adapters/signals/null-production-signals.adapter.ts';

const locationId = 'plant-east';
const actorId = '00000000-0000-4000-8000-000000000001';
const shiftId = '00000000-0000-4000-8000-000000000002';
const configId = '00000000-0000-4000-8000-000000000003';
const scheduleRunId = '00000000-0000-4000-8000-000000000004';
const now = new Date('2026-07-14T22:00:00.000Z');

const input: SchedulingInput = {
  orders: [],
  machines: [],
  shift: {
    id: shiftId,
    startsAt: '2026-07-14T14:00:00.000Z',
    endsAt: now.toISOString(),
    timezone: 'America/New_York',
    effectiveFolderCount: 2,
    version: 1,
  },
  config: {
    id: configId,
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    version: 1,
  },
};

const proposal: ScheduleProposal = {
  scheduleRunId,
  productionShiftId: shiftId,
  schedulerConfigId: configId,
  status: 'accepted',
  inputSnapshotHash: 'a'.repeat(64),
  outputPlanHash: 'b'.repeat(64),
  algorithmVersion: 'fixed-pulse-ffd-v2',
  pulseMinutes: 56,
  pulseCapacityLbs: 100,
  batchCount: 1,
  makespanMinutes: 224,
  plannedCompletionAt: '2026-07-14T18:00:00.000Z',
  batches: [
    {
      sequence: 0,
      orderIds: ['00000000-0000-4000-8000-000000000005'],
      derivedWeightLbs: 50,
      bagCount: 1,
      stages: ['sorting', 'washing', 'drying', 'folding_packaging'].map(
        (stage, index) => ({
          stage: stage as
            | 'sorting'
            | 'washing'
            | 'drying'
            | 'folding_packaging',
          startsAt: new Date(
            Date.parse(input.shift.startsAt) + index * 56 * 60_000,
          ).toISOString(),
          endsAt: new Date(
            Date.parse(input.shift.startsAt) + (index + 1) * 56 * 60_000,
          ).toISOString(),
          machineIds: [],
        }),
      ),
    },
  ],
  unplacedOrderIds: [],
  warnings: [],
  createdAt: '2026-07-14T13:00:00.000Z',
  acceptedAt: '2026-07-14T13:30:00.000Z',
  acceptedBy: actorId,
  acknowledgedWarningCodes: [],
  supersededAt: null,
};

const expiredPolicy = {
  ...allowPolicy,
  evaluateShiftPlanningWindow: () => ({
    tag: 'err' as const,
    error: {
      code: 'PRODUCTION_SHIFT_EXPIRED',
      message: 'This production shift has ended.',
    },
  }),
};

describe('scheduling shift-window orchestration', () => {
  it('does not compute a plan for an expired shift', async () => {
    const propose = vi.fn();
    const saveSchedule = vi.fn();
    const operations: Parameters<
      CreateScheduleRepository['transaction']
    >[0] extends (operations: infer Operations) => Promise<unknown>
      ? Operations
      : never = {
      findWorkEvent: vi.fn(async () => null),
      lockLocationScheduling: vi.fn(async () => undefined),
      lockShiftForPlanning: vi.fn(
        async (): Promise<'available'> => 'available',
      ),
      loadSchedulingInput: vi.fn(async () => input),
      loadCurrentPlan: vi.fn(async () => null),
      saveSchedule,
      appendWorkEvent: vi.fn(async () => undefined),
    };
    const compute = makeCreateSchedule({
      repo: { transaction: (work) => work(operations) },
      scheduler: {
        propose,
      },
      policy: expiredPolicy,
      clock: { now: () => now },
      ids: { next: () => scheduleRunId },
    });

    await expect(
      compute({
        locationId,
        productionShiftId: shiftId,
        schedulerConfigId: configId,
        actorId,
        idempotencyKey: 'compute-expired-shift',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_shift_expired', kind: 'conflict' },
    });
    expect(propose).not.toHaveBeenCalled();
    expect(saveSchedule).not.toHaveBeenCalled();
  });

  it('does not accept a plan after its shift ends', async () => {
    const acceptSchedule = vi.fn();
    const operations: Parameters<
      AcceptScheduleRepository['transaction']
    >[0] extends (operations: infer Operations) => Promise<unknown>
      ? Operations
      : never = {
      findWorkEvent: vi.fn(async () => null),
      lockLocationScheduling: vi.fn(async () => undefined),
      loadSchedule: vi.fn(async () => ({
        schedule: proposal,
        inputSnapshot: input,
      })),
      lockAndValidateScheduleInput: vi.fn(async () => true),
      productionRunExists: vi.fn(async () => false),
      acceptSchedule,
    };
    const accept = makeAcceptSchedule({
      repo: { transaction: (work) => work(operations) },
      policy: expiredPolicy,
      clock: { now: () => now },
    });

    await expect(
      accept({
        locationId,
        scheduleRunId,
        expectedOutputPlanHash: proposal.outputPlanHash,
        acknowledgedWarningCodes: [],
        actorId,
        idempotencyKey: 'accept-expired-shift',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_shift_expired', kind: 'conflict' },
    });
    expect(acceptSchedule).not.toHaveBeenCalled();
  });

  it('does not create execution after its shift ends', async () => {
    const startSchedule = vi.fn();
    const operations: Parameters<
      StartScheduleRepository['transaction']
    >[0] extends (operations: infer Operations) => Promise<unknown>
      ? Operations
      : never = {
      findWorkEvent: vi.fn(async () => null),
      lockLocationScheduling: vi.fn(async () => undefined),
      lockShiftForStart: vi.fn(async () => true),
      loadSchedule: vi.fn(async () => ({
        schedule: proposal,
        inputSnapshot: input,
        acceptedBy: actorId,
        acknowledgedWarningCodes: [],
      })),
      lockAndLoadStartOrders: vi.fn(async () =>
        input.orders.map((order) => ({
          id: order.id,
          operationalStatus: 'eligible',
          executionStatus: 'unassigned',
          version: order.version,
        })),
      ),
      productionRunExists: vi.fn(async () => false),
      startSchedule,
    };
    const start = makeStartSchedule({
      repo: { transaction: (work) => work(operations) },
      policy: expiredPolicy,
      clock: { now: () => now },
      signals: nullProductionSignals,
    });

    await expect(
      start({
        locationId,
        scheduleRunId,
        expectedOutputPlanHash: proposal.outputPlanHash,
        actorId,
        idempotencyKey: 'start-expired-shift',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_shift_expired', kind: 'conflict' },
    });
    expect(startSchedule).not.toHaveBeenCalled();
  });
});
