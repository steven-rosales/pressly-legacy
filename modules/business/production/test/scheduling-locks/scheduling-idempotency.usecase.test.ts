import type {
  AcceptScheduleResult,
  ScheduleProposal,
  StartScheduleResult,
} from '@pressly/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { AcceptScheduleRepository } from '../../src/accept-schedule/accept-schedule.port.ts';
import { makeAcceptSchedule } from '../../src/accept-schedule/accept-schedule.usecase.ts';
import type { CreateScheduleRepository } from '../../src/create-schedule/create-schedule.port.ts';
import { makeCreateSchedule } from '../../src/create-schedule/create-schedule.usecase.ts';
import { defineWorkEventCommand } from '../../src/command-execution/production-idempotency.policy.ts';
import type { ProductionPolicyPort } from '../../src/production-policy/production-policy.port.ts';
import type { StoredWorkEvent } from '../../src/command-execution/production-command.port.ts';
import type { StartScheduleRepository } from '../../src/start-schedule/start-schedule.port.ts';
import { makeStartSchedule } from '../../src/start-schedule/start-schedule.usecase.ts';

const locationId = 'location-1';
const actorId = '00000000-0000-4000-8000-000000000001';
const shiftId = '00000000-0000-4000-8000-000000000002';
const configId = '00000000-0000-4000-8000-000000000003';
const scheduleRunId = '00000000-0000-4000-8000-000000000004';
const now = new Date('2026-07-14T15:00:00.000Z');

const proposal: ScheduleProposal = {
  scheduleRunId,
  productionShiftId: shiftId,
  schedulerConfigId: configId,
  status: 'draft',
  inputSnapshotHash: 'input-hash',
  outputPlanHash: 'output-hash',
  algorithmVersion: 'fixed-pulse-ffd-v2',
  pulseMinutes: 56,
  pulseCapacityLbs: 100,
  batchCount: 0,
  makespanMinutes: 0,
  plannedCompletionAt: '2026-07-14T15:00:00.000Z',
  batches: [],
  unplacedOrderIds: [],
  warnings: [],
  createdAt: now.toISOString(),
  acceptedAt: null,
  acceptedBy: null,
  acknowledgedWarningCodes: [],
  supersededAt: null,
};

const replay = <Value extends Readonly<Record<string, unknown>>>(
  command: StoredWorkEvent['command'],
  value: Value,
): StoredWorkEvent => ({ command, result: value, valid: true });

describe('scheduling idempotency after the location lock', () => {
  it('replays Compute when the winning transaction commits while this call waits', async () => {
    const command = {
      locationId,
      productionShiftId: shiftId,
      schedulerConfigId: configId,
      actorId,
      idempotencyKey: 'compute-1',
    };
    const identity = defineWorkEventCommand({
      operation: 'schedule_computed',
      locationId,
      actorId,
      entityType: 'schedule_run',
      payload: { productionShiftId: shiftId, schedulerConfigId: configId },
    });
    const findWorkEvent = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(replay(identity, proposal));
    const lockLocationScheduling = vi.fn(async () => undefined);
    const lockShiftForPlanning = vi.fn();
    const operations = {
      findWorkEvent,
      lockLocationScheduling,
      lockShiftForPlanning,
      loadSchedulingInput: vi.fn(),
      loadCurrentPlan: vi.fn(),
      saveSchedule: vi.fn(),
      appendWorkEvent: vi.fn(),
    };
    const repo: CreateScheduleRepository = {
      transaction: (work) => work(operations),
    };
    const compute = makeCreateSchedule({
      repo,
      scheduler: {
        forecastDemand: vi.fn(),
        propose: vi.fn(),
        proposeOnlinePlacement: vi.fn(),
      },
      policy: {} as ProductionPolicyPort,
      clock: { now: () => now },
      ids: { next: () => scheduleRunId },
    });

    await expect(compute(command)).resolves.toMatchObject({
      tag: 'ok',
      value: { scheduleRunId },
    });
    expect(lockLocationScheduling).toHaveBeenCalledWith(locationId);
    expect(findWorkEvent).toHaveBeenCalledTimes(2);
    expect(lockShiftForPlanning).not.toHaveBeenCalled();
  });

  it('replays Accept after acquiring the location scheduling lock', async () => {
    const command = {
      locationId,
      scheduleRunId,
      expectedOutputPlanHash: proposal.outputPlanHash,
      acknowledgedWarningCodes: [],
      actorId,
      idempotencyKey: 'accept-1',
    };
    const identity = defineWorkEventCommand({
      operation: 'schedule_accepted',
      locationId,
      actorId,
      entityType: 'schedule_run',
      entityId: scheduleRunId,
      payload: {
        expectedOutputPlanHash: proposal.outputPlanHash,
        acknowledgedWarningCodes: [],
      },
    });
    const accepted: AcceptScheduleResult = {
      scheduleRunId,
      productionShiftId: shiftId,
      acceptedAt: now.toISOString(),
      replayed: false,
    };
    const findWorkEvent = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(replay(identity, accepted));
    const lockLocationScheduling = vi.fn(async () => undefined);
    const loadSchedule = vi.fn();
    const operations = {
      findWorkEvent,
      lockLocationScheduling,
      loadSchedule,
      lockAndValidateScheduleInput: vi.fn(),
      productionRunExists: vi.fn(),
      acceptSchedule: vi.fn(),
    };
    const repo: AcceptScheduleRepository = {
      transaction: (work) => work(operations),
    };
    const accept = makeAcceptSchedule({
      repo,
      policy: {} as ProductionPolicyPort,
      clock: { now: () => now },
    });

    await expect(accept(command)).resolves.toMatchObject({
      tag: 'ok',
      value: { scheduleRunId, replayed: true },
    });
    expect(lockLocationScheduling).toHaveBeenCalledWith(locationId);
    expect(findWorkEvent).toHaveBeenCalledTimes(2);
    expect(loadSchedule).not.toHaveBeenCalled();
  });

  it('replays Start after acquiring the location scheduling lock', async () => {
    const command = {
      locationId,
      scheduleRunId,
      expectedOutputPlanHash: proposal.outputPlanHash,
      actorId,
      idempotencyKey: 'start-1',
    };
    const identity = defineWorkEventCommand({
      operation: 'production_run_started',
      locationId,
      actorId,
      entityType: 'schedule_run',
      entityId: scheduleRunId,
      payload: { expectedOutputPlanHash: proposal.outputPlanHash },
    });
    const started: StartScheduleResult = {
      scheduleRunId,
      productionRunId: '00000000-0000-4000-8000-000000000005',
      productionBatchIds: [],
      queueVersion: 1,
      startedAt: now.toISOString(),
      replayed: false,
    };
    const findWorkEvent = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(replay(identity, started));
    const lockLocationScheduling = vi.fn(async () => undefined);
    const loadSchedule = vi.fn();
    const operations = {
      findWorkEvent,
      lockLocationScheduling,
      lockShiftForStart: vi.fn(),
      loadSchedule,
      lockAndLoadStartOrders: vi.fn(),
      productionRunExists: vi.fn(),
      startSchedule: vi.fn(),
    };
    const repo: StartScheduleRepository = {
      transaction: (work) => work(operations),
    };
    const start = makeStartSchedule({
      repo,
      policy: {} as ProductionPolicyPort,
      clock: { now: () => now },
    });

    await expect(start(command)).resolves.toMatchObject({
      tag: 'ok',
      value: { productionRunId: started.productionRunId, replayed: true },
    });
    expect(lockLocationScheduling).toHaveBeenCalledWith(locationId);
    expect(findWorkEvent).toHaveBeenCalledTimes(2);
    expect(loadSchedule).not.toHaveBeenCalled();
  });
});
