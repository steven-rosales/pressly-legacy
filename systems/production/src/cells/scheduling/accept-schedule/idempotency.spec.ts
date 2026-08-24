import { describe, expect, it } from 'vitest';
import type { AcceptScheduleWorkEventCommand } from './execute.ts';
import {
  resolveAcceptScheduleReplay,
  serializeAcceptScheduleWorkEventCommand,
} from './idempotency.ts';
import type { AcceptScheduleResult } from './types.ts';

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  schedule: '10000000-0000-4000-8000-000000000002',
  shift: '10000000-0000-4000-8000-000000000003',
} as const;
const outputHash = 'a'.repeat(64);

const command: AcceptScheduleWorkEventCommand = {
  operation: 'schedule_accepted',
  locationId: 'location-1',
  actorId: ids.actor,
  target: { entityType: 'schedule_run', entityId: ids.schedule },
  expectedVersion: null,
  payload: {
    expectedOutputPlanHash: outputHash,
    acknowledgedWarningCodes: ['SHIFT_OVERFLOW', 'OVERSIZED_ORDER'],
  },
};

const accepted: AcceptScheduleResult = {
  scheduleRunId: ids.schedule,
  productionShiftId: ids.shift,
  acceptedAt: '2026-08-22T14:00:00.000Z',
  replayed: false,
};

describe('accept schedule idempotency', () => {
  it('serializes the exact command identity in caller warning order', () => {
    expect(serializeAcceptScheduleWorkEventCommand(command)).toEqual({
      operation: 'schedule_accepted',
      locationId: 'location-1',
      actorId: ids.actor,
      target: { entityType: 'schedule_run', entityId: ids.schedule },
      expectedVersion: null,
      payload: {
        expectedOutputPlanHash: outputHash,
        acknowledgedWarningCodes: ['SHIFT_OVERFLOW', 'OVERSIZED_ORDER'],
      },
    });
  });

  it('distinguishes miss, replay, malformed receipt, and order-sensitive divergence', () => {
    expect(resolveAcceptScheduleReplay(null, command)).toEqual({
      kind: 'miss',
    });
    expect(
      resolveAcceptScheduleReplay(
        {
          command: serializeAcceptScheduleWorkEventCommand(command),
          result: accepted,
          valid: true,
        },
        command,
      ),
    ).toEqual({ kind: 'replay', result: { ...accepted, replayed: true } });
    expect(
      resolveAcceptScheduleReplay(
        { command: {}, result: {}, valid: false },
        command,
      ),
    ).toEqual({ kind: 'conflict' });
    expect(
      resolveAcceptScheduleReplay(
        {
          command: {
            ...serializeAcceptScheduleWorkEventCommand(command),
            payload: {
              expectedOutputPlanHash: outputHash,
              acknowledgedWarningCodes: ['OVERSIZED_ORDER', 'SHIFT_OVERFLOW'],
            },
          },
          result: accepted,
          valid: true,
        },
        command,
      ),
    ).toEqual({ kind: 'conflict' });
  });
});
