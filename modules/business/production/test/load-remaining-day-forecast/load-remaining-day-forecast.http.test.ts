import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { result } from '@pressly/kernel';
import express, { type ErrorRequestHandler } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeLoadRemainingDayForecastRoute } from '../../src/load-remaining-day-forecast/load-remaining-day-forecast.route.ts';

const servers: Server[] = [];

const start = async (app: express.Express): Promise<string> => {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
};

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

const emptyForecast = {
  locationId: 'location-1',
  serviceDay: '2026-07-26',
  timezone: 'America/New_York',
  window: {
    startsAt: '2026-07-26T04:00:00.000Z',
    endsAt: '2026-07-27T04:00:00.000Z',
  },
  asOf: '2026-07-26T15:00:00.000Z',
  assumptions: {
    algorithmVersion: 'online-stable-insertion-v1' as const,
    overdueUnfinishedIncluded: true as const,
    physicalIntakeRequired: true as const,
    wholeOrderPlacement: true as const,
    expectedWeightsAdvisory: true as const,
    missingEstimatesExcludedFromWeightTotals: true as const,
    placementRevalidatedOnCommit: true as const,
    preciseFinishForecasted: false as const,
  },
  shifts: [],
  totals: {
    all: {
      orderCount: 0,
      knownWeightLbs: 0,
      missingEstimateOrderCount: 0,
    },
    inProduction: {
      orderCount: 0,
      knownWeightLbs: 0,
      missingEstimateOrderCount: 0,
    },
    readyToPlace: {
      orderCount: 0,
      knownWeightLbs: 0,
      missingEstimateOrderCount: 0,
    },
    expectedLater: {
      orderCount: 0,
      knownWeightLbs: 0,
      missingEstimateOrderCount: 0,
    },
    needsShift: {
      orderCount: 0,
      knownWeightLbs: 0,
      missingEstimateOrderCount: 0,
    },
  },
  capacityRisk: {
    level: 'clear' as const,
    reasons: ['no_ready_work' as const],
    pulseCapacityLbs: null,
  },
  groups: {
    inProduction: [],
    readyToPlace: [],
    expectedLater: [],
    needsShift: [],
  },
};

const makeApp = () => {
  const loadForecast = vi.fn(async () => result.ok(emptyForecast));
  const authenticate = vi.fn((_request, _response, next) => next());
  const authorize = vi.fn((_request, _response, next) => next());
  const app = express();
  app.use(
    makeLoadRemainingDayForecastRoute({
      loadForecast,
      authenticate,
      authorize,
    }),
  );
  const errors: ErrorRequestHandler = (error, _request, response, _next) => {
    const status = Number(error?.status ?? 500);
    response.status(status).json({
      ok: false,
      error: {
        code: String(error?.code ?? 'unexpected_error'),
        message: String(error?.safeMessage ?? 'Unexpected error.'),
      },
    });
  };
  app.use(errors);
  return { app, loadForecast, authenticate, authorize };
};

describe('remaining-day forecast HTTP boundary', () => {
  it('maps strict location and service-day input into the read use case', async () => {
    const harness = makeApp();
    const response = await fetch(
      `${await start(harness.app)}/production/locations/location-1/forecast?serviceDay=2026-07-26`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: emptyForecast,
    });
    expect(harness.authenticate).toHaveBeenCalledOnce();
    expect(harness.authorize).toHaveBeenCalledOnce();
    expect(harness.loadForecast).toHaveBeenCalledWith({
      locationId: 'location-1',
      serviceDay: '2026-07-26',
    });
  });

  it.each([
    '?serviceDay=2026-02-30',
    '?serviceDay=2026-07-26&asOf=caller-controlled',
    '',
  ])(
    'rejects invalid or undeclared query input %s before authorization',
    async (query) => {
      const harness = makeApp();
      const response = await fetch(
        `${await start(harness.app)}/production/locations/location-1/forecast${query}`,
      );

      expect(response.status).toBe(400);
      expect(harness.authenticate).toHaveBeenCalledOnce();
      expect(harness.authorize).not.toHaveBeenCalled();
      expect(harness.loadForecast).not.toHaveBeenCalled();
    },
  );
});
