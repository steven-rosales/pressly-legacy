import { describe, expect, it } from 'vitest';
import {
  toStartScheduleCommand,
  toStartScheduleResult,
} from '../../../../src/features/scheduling/start-schedule/start-schedule.contract.mapper.ts';

describe('start schedule mapper', () => {
  it('maps the request inward and copies the replay-safe result outward', () => {
    const command = toStartScheduleCommand(
      {
        locationId: 'location-1',
        scheduleRunId: '00000000-0000-4000-8000-000000000001',
        actorId: 'actor-1',
      },
      {
        expectedOutputPlanHash: 'a'.repeat(64),
        idempotencyKey: 'schedule-start-1',
      },
    );
    const result = {
      scheduleRunId: command.scheduleRunId,
      productionRunId: '00000000-0000-4000-8000-000000000002',
      productionBatchIds: ['00000000-0000-4000-8000-000000000003'] as const,
      queueVersion: 1,
      startedAt: '2026-08-02T16:00:00.000Z',
      replayed: false,
    } as const;
    const wire = toStartScheduleResult(result);

    expect(command).toEqual({
      locationId: 'location-1',
      scheduleRunId: '00000000-0000-4000-8000-000000000001',
      expectedOutputPlanHash: 'a'.repeat(64),
      idempotencyKey: 'schedule-start-1',
      actorId: 'actor-1',
    });
    expect(wire).toEqual(result);
    expect(wire.productionBatchIds).not.toBe(result.productionBatchIds);
  });
});
