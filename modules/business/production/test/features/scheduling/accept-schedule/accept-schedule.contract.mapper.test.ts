import { describe, expect, it } from 'vitest';
import {
  toAcceptScheduleCommand,
  toAcceptScheduleResult,
} from '../../../../src/features/scheduling/accept-schedule/accept-schedule.contract.mapper.ts';

describe('accept schedule mapper', () => {
  it('maps the request inward and retains the replay-safe ISO result', () => {
    const command = toAcceptScheduleCommand(
      {
        locationId: 'location-1',
        scheduleRunId: '00000000-0000-4000-8000-000000000001',
        actorId: 'actor-1',
      },
      {
        expectedOutputPlanHash: 'a'.repeat(64),
        acknowledgedWarningCodes: ['SHIFT_OVERFLOW'],
        idempotencyKey: 'schedule-accept-1',
      },
    );
    const result = {
      scheduleRunId: command.scheduleRunId,
      productionShiftId: '00000000-0000-4000-8000-000000000002',
      acceptedAt: '2026-08-02T15:30:00.000Z',
      replayed: true,
    } as const;

    expect(command).toEqual({
      locationId: 'location-1',
      scheduleRunId: '00000000-0000-4000-8000-000000000001',
      expectedOutputPlanHash: 'a'.repeat(64),
      acknowledgedWarningCodes: ['SHIFT_OVERFLOW'],
      idempotencyKey: 'schedule-accept-1',
      actorId: 'actor-1',
    });
    expect(toAcceptScheduleResult(result)).toEqual(result);
  });
});
