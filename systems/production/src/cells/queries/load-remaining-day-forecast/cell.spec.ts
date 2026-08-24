import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeLoadRemainingDayForecastCell } from './cell.ts';

describe('load remaining-day forecast cell', () => {
  it('declares a selected headless repeatable-read query', () => {
    const cell = makeLoadRemainingDayForecastCell({
      repo: { load: vi.fn() },
      clock: { now: () => new Date() },
      policy: productionRules,
      scheduler: { proposeOnlinePlacement: vi.fn() },
    });
    expect(cell).toMatchObject({
      id: 'production.load-remaining-day-forecast.v1',
      kind: 'query',
      authentication: 'none',
      authorization: null,
      consistency: { transaction: 'required', concurrency: 'none' },
      surfaces: [],
      observability: { operation: 'production.load_remaining_day_forecast' },
    });
  });
});
