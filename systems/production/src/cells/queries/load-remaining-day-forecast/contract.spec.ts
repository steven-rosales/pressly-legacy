import { proveOperation } from '@pressly/testkit/operation-proof';
import { loadRemainingDayForecastCellDeclaration } from './cell.ts';
import type { ProductionRemainingDayForecast } from './boundary.ts';
import { describe, expect, it } from 'vitest';
import { loadRemainingDayForecastContract } from './contract.ts';
import {
  loadRemainingDayForecastExecutionInvalid,
  loadRemainingDayForecastInvalidServiceDay,
  loadRemainingDayForecastLocationNotFound,
  loadRemainingDayForecastScopeTooLarge,
} from './failures.ts';

const emptySummary = {
  orderCount: 0,
  knownWeightLbs: 0,
  missingEstimateOrderCount: 0,
};
const forecast: ProductionRemainingDayForecast = {
  locationId: 'location-1',
  serviceDay: '2026-03-08',
  timezone: 'America/New_York',
  window: {
    startsAt: '2026-03-08T05:00:00.000Z',
    endsAt: '2026-03-09T04:00:00.000Z',
  },
  asOf: '2026-03-08T15:00:00.000Z',
  assumptions: {
    algorithmVersion: 'online-stable-insertion-v1',
    overdueUnfinishedIncluded: true,
    physicalIntakeRequired: true,
    wholeOrderPlacement: true,
    expectedWeightsAdvisory: true,
    missingEstimatesExcludedFromWeightTotals: true,
    placementRevalidatedOnCommit: true,
    preciseFinishForecasted: false,
  },
  shifts: [],
  totals: {
    all: emptySummary,
    inProduction: emptySummary,
    readyToPlace: emptySummary,
    expectedLater: emptySummary,
    needsShift: emptySummary,
  },
  capacityRisk: {
    level: 'clear',
    reasons: ['no_ready_work'],
    pulseCapacityLbs: null,
  },
  groups: {
    inProduction: [],
    readyToPlace: [],
    expectedLater: [],
    needsShift: [],
  },
};

describe('load remaining-day forecast contract', () => {
  proveOperation({
    operationId: 'production.load-remaining-day-forecast.v1',
    declaration: loadRemainingDayForecastCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'accepts only strict location params and one real service-day query',
        proves: ['contract'],
        run: () => {
          expect(
            loadRemainingDayForecastContract.input.decode({
              params: { locationId: 'location-1' },
              query: { serviceDay: '2026-03-08' },
            }),
          ).toEqual({
            kind: 'valid',
            value: { locationId: 'location-1', serviceDay: '2026-03-08' },
          });
          for (const value of [
            {
              params: { locationId: 'location-1' },
              query: { serviceDay: '2026-02-30' },
            },
            {
              params: { locationId: 'location-1' },
              query: { serviceDay: '2026-03-08', asOf: 'caller-controlled' },
            },
            { params: { locationId: 'location-1' }, query: {} },
          ])
            expect(
              loadRemainingDayForecastContract.input.decode(value),
            ).toMatchObject({ kind: 'invalid' });
        },
      },
    ],
  });

  it('round-trips the complete strict serialized result', () => {
    expect(
      loadRemainingDayForecastContract.output.decode(
        loadRemainingDayForecastContract.output.encode(forecast),
      ),
    ).toEqual({ kind: 'valid', value: forecast });
  });

  it('round-trips every exact expected failure', () => {
    for (const failure of [
      loadRemainingDayForecastLocationNotFound(),
      loadRemainingDayForecastInvalidServiceDay(),
      loadRemainingDayForecastScopeTooLarge(),
      loadRemainingDayForecastExecutionInvalid(
        'The production order execution state is invalid.',
      ),
    ])
      expect(
        loadRemainingDayForecastContract.failure.decode(
          loadRemainingDayForecastContract.failure.encode(failure),
        ),
      ).toEqual({ kind: 'valid', value: failure });
  });
});
