import { describe, expect, it } from 'vitest';
import { proposeFixedPulseScheduleV2 } from '../../model/production-schedule/propose-v2.ts';
import type { SchedulingInput } from '../../model/production-schedule/model.ts';
import {
  readProductionSchedulingInput,
  readProductionSchedulingOutput,
  writeProductionSchedulingInput,
  writeProductionSchedulingOutput,
} from './schedule-json.postgres.ts';

const input: SchedulingInput = {
  orders: [],
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

describe('production schedule PostgreSQL JSON', () => {
  it('validates canonical input and output in both directions', () => {
    const output = proposeFixedPulseScheduleV2(input);
    const inputJson = writeProductionSchedulingInput(input);
    const outputJson = writeProductionSchedulingOutput(output);

    expect(readProductionSchedulingInput(inputJson)).toEqual(input);
    expect(readProductionSchedulingOutput(outputJson)).toEqual(output);
  });

  it('preserves the historical v1 stored-output rejection', () => {
    expect(() =>
      readProductionSchedulingOutput({
        ...proposeFixedPulseScheduleV2(input),
        algorithmVersion: 'fixed-pulse-ffd-v1',
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'production_schedule_output_plan_invalid',
      }),
    );
  });

  it('rejects malformed input and non-finite generated output before storage', () => {
    expect(() => readProductionSchedulingInput({ orders: [] })).toThrow(
      expect.objectContaining({
        code: 'production_schedule_input_snapshot_invalid',
      }),
    );
    expect(() =>
      writeProductionSchedulingOutput({
        ...proposeFixedPulseScheduleV2(input),
        pulseCapacityLbs: Number.NaN,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'production_schedule_output_plan_invalid',
      }),
    );
  });
});
