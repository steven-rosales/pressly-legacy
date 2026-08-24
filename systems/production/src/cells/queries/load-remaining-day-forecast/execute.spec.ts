import { proveOperation } from '@pressly/testkit/operation-proof';
import { loadRemainingDayForecastCellDeclaration } from './cell.ts';
import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeExecuteLoadRemainingDayForecast } from './execute.ts';
import type {
  LoadRemainingDayForecastExpectedFailure,
  RemainingDayForecastReadModel,
} from './types.ts';

const asOf = new Date('2026-03-08T15:00:00.000Z');
const input = { locationId: 'location-1', serviceDay: '2026-03-08' };
const emptyReadModel = (): RemainingDayForecastReadModel => ({
  locationId: input.locationId,
  timezone: 'America/New_York',
  serviceDay: input.serviceDay,
  startsAt: new Date('2026-03-08T05:00:00.000Z'),
  endsAt: new Date('2026-03-09T04:00:00.000Z'),
  asOf,
  demandRows: [],
  shifts: [],
  activeRuns: [],
});

const expectedFailureCases: readonly Readonly<{
  name: string;
  loaded: 'invalid_service_day' | 'scope_too_large' | null;
  failure: LoadRemainingDayForecastExpectedFailure;
}>[] = [
  {
    name: 'missing location',
    loaded: null,
    failure: {
      tag: 'ProductionFailure',
      kind: 'not_found',
      code: 'production_location_not_found',
      message: 'The active production location was not found.',
      safeMessage: 'The active production location was not found.',
    },
  },
  {
    name: 'invalid service day',
    loaded: 'invalid_service_day',
    failure: {
      tag: 'ProductionFailure',
      kind: 'validation',
      classification: 'malformed',
      code: 'production_forecast_service_day_invalid',
      message: 'The requested service day is invalid for this location.',
      safeMessage: 'The requested service day is invalid for this location.',
    },
  },
  {
    name: 'oversized forecast scope',
    loaded: 'scope_too_large',
    failure: {
      tag: 'ProductionFailure',
      kind: 'conflict',
      code: 'production_forecast_scope_too_large',
      message: 'The remaining-day forecast exceeds the supported work limit.',
      safeMessage:
        'The remaining-day forecast exceeds the supported work limit.',
    },
  },
];

describe('load remaining-day forecast executor', () => {
  proveOperation({
    operationId: 'production.load-remaining-day-forecast.v1',
    declaration: loadRemainingDayForecastCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'reads one clock before the repeatable-read repository and carries it to output',
        proves: ['executor-success'],
        run: async () => {
          const trace: string[] = [];
          const clock = vi.fn(() => {
            trace.push('clock');
            return asOf;
          });
          const load = vi.fn(async () => {
            trace.push('read');
            return emptyReadModel();
          });
          const execute = makeExecuteLoadRemainingDayForecast({
            repo: { load },
            clock: { now: clock },
            policy: productionRules,
            scheduler: { proposeOnlinePlacement: vi.fn() },
          });

          await expect(execute(input)).resolves.toMatchObject({
            kind: 'success',
            value: {
              asOf: asOf.toISOString(),
              assumptions: {
                overdueUnfinishedIncluded: true,
                placementRevalidatedOnCommit: true,
              },
            },
          });
          expect(trace).toEqual(['clock', 'read']);
          expect(clock).toHaveBeenCalledOnce();
          expect(load).toHaveBeenCalledWith({ ...input, asOf, rowLimit: 500 });
        },
      },
    ],
  });

  it.each(expectedFailureCases)(
    'returns the exact typed $name failure',
    async ({ loaded, failure }) => {
      const execute = makeExecuteLoadRemainingDayForecast({
        repo: { load: async () => loaded },
        clock: { now: () => asOf },
        policy: productionRules,
        scheduler: { proposeOnlinePlacement: vi.fn() },
      });
      await expect(execute(input)).resolves.toEqual({
        kind: 'failure',
        failure,
      });
    },
  );

  it('maps clock and repository faults to the exact database error', async () => {
    const cause = Object.freeze({ fixture: 'forecast database unavailable' });
    const execute = makeExecuteLoadRemainingDayForecast({
      repo: {
        load: async () => {
          throw cause;
        },
      },
      clock: { now: () => asOf },
      policy: productionRules,
      scheduler: { proposeOnlinePlacement: vi.fn() },
    });
    await expect(execute(input)).rejects.toMatchObject({
      code: 'production_forecast_load_failed',
      status: 503,
      cause,
    });
  });
});
