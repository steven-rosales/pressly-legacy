import { describe, expect, it } from 'vitest';
import {
  resolveCreateScheduleReplay,
  serializeCreateScheduleCommand,
} from './idempotency.ts';
import type { ScheduleProposal } from '../../../model/production-schedule/model.ts';
const command = {
  operation: 'schedule_computed',
  locationId: 'location',
  actorId: 'actor',
  target: { entityType: 'schedule_run', entityId: null },
  expectedVersion: null,
  payload: { productionShiftId: 'shift', schedulerConfigId: 'config' },
} as const;
const result: ScheduleProposal = {
  scheduleRunId: 'id',
  productionShiftId: 'shift',
  schedulerConfigId: 'config',
  status: 'draft',
  inputSnapshotHash: 'a'.repeat(64),
  outputPlanHash: 'b'.repeat(64),
  algorithmVersion: 'fixed-pulse-ffd-v1',
  pulseMinutes: 56,
  pulseCapacityLbs: 100,
  batchCount: 0,
  makespanMinutes: 0,
  plannedCompletionAt: '2026-08-22T21:00:00.000Z',
  batches: [],
  unplacedOrderIds: [],
  warnings: [],
  createdAt: '2026-08-22T12:00:00.000Z',
  acceptedAt: null,
  acceptedBy: null,
  acknowledgedWarningCodes: [],
  supersededAt: null,
};
describe('create schedule idempotency', () => {
  it('misses, replays exact history, and rejects divergence/malformed data', () => {
    expect(resolveCreateScheduleReplay(null, command)).toEqual({
      kind: 'miss',
    });
    const stored = {
      command: serializeCreateScheduleCommand(command),
      result,
      valid: true,
    };
    expect(resolveCreateScheduleReplay(stored, command)).toMatchObject({
      kind: 'replay',
      result,
    });
    expect(
      resolveCreateScheduleReplay(stored, {
        ...command,
        payload: { ...command.payload, schedulerConfigId: 'other' },
      }),
    ).toEqual({ kind: 'conflict' });
    expect(
      resolveCreateScheduleReplay(
        { command: {}, result: {}, valid: false },
        command,
      ),
    ).toEqual({ kind: 'conflict' });
  });
});
