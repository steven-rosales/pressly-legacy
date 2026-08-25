import { describe, expect, it } from 'vitest';
import {
  resolveStartScheduleReplay,
  serializeStartScheduleWorkEventCommand,
} from './idempotency.ts';
import type { StartScheduleWorkEventCommand } from './execute.ts';

const command: StartScheduleWorkEventCommand = {
  operation: 'production_run_started',
  locationId: 'location-1',
  actorId: 'actor-1',
  target: { entityType: 'schedule_run', entityId: 'schedule-1' },
  expectedVersion: null,
  payload: { expectedOutputPlanHash: 'a'.repeat(64) },
};
const started = {
  scheduleRunId: 'schedule-1',
  productionRunId: 'run-1',
  productionBatchIds: ['batch-1'],
  queueVersion: 1,
  startedAt: '2026-08-22T15:00:00.000Z',
  replayed: false,
} as const;

describe('start schedule idempotency', () => {
  it('distinguishes miss, exact replay, divergent reuse, and malformed receipt', () => {
    expect(resolveStartScheduleReplay(null, command)).toEqual({ kind: 'miss' });
    expect(
      resolveStartScheduleReplay(
        {
          command: serializeStartScheduleWorkEventCommand(command),
          result: started,
          valid: true,
        },
        command,
      ),
    ).toEqual({ kind: 'replay', result: { ...started, replayed: true } });
    expect(
      resolveStartScheduleReplay(
        {
          command: serializeStartScheduleWorkEventCommand({
            ...command,
            actorId: 'other',
          }),
          result: started,
          valid: true,
        },
        command,
      ),
    ).toEqual({ kind: 'conflict' });
    expect(
      resolveStartScheduleReplay(
        { command: {}, result: {}, valid: false },
        command,
      ),
    ).toEqual({ kind: 'conflict' });
  });
});
