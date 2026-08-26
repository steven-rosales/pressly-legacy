import { EventEmitter } from 'node:events';
import type { Logger } from '@pressly/logging';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { makeApiRequestMetrics } from '@pressly/http-host/runtime';
import {
  normalizedApiRoute,
  unmatchedApiRoute,
} from '@pressly/http-host/runtime';
import {
  initializeSentry,
  makeApiSignalSinks,
  requireApiSentryInitialization,
} from '@pressly/http-host/runtime';
import { presslyObservabilityCatalog } from '@pressly/topology/observability';

describe('API Sentry initialization', () => {
  it('initializes only when the SDK creates a DSN-backed client', () => {
    const initialize = vi.fn();

    const initialized = initializeSentry(
      {
        enabled: true,
        dsn: 'https://public@example.com/1',
        environment: 'test',
        release: 'api-test',
        traceSampleRate: 0,
      },
      { initialize, hasInitializedDsn: () => true },
    );

    expect(initialized).toBe(true);
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        enableLogs: true,
        enableMetrics: true,
        sendDefaultPii: false,
      }),
    );
  });

  it('rejects an invalid DSN before initializing the SDK', () => {
    const initialize = vi.fn();
    const emergencyLog = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const initialized = initializeSentry(
      {
        enabled: true,
        dsn: 'https://example.com',
        environment: 'test',
        release: undefined,
        traceSampleRate: 0,
      },
      { initialize },
    );

    expect(initialized).toBe(false);
    expect(initialize).not.toHaveBeenCalled();
    expect(emergencyLog).toHaveBeenCalledWith(
      expect.stringContaining('api.telemetry.initialization_failed'),
    );

    emergencyLog.mockRestore();
  });

  it('remains unavailable when the SDK creates no DSN-backed client', () => {
    const emergencyLog = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const initialized = initializeSentry(
      {
        enabled: true,
        dsn: 'https://public@example.com/1',
        environment: 'test',
        release: undefined,
        traceSampleRate: 0,
      },
      { initialize: vi.fn(), hasInitializedDsn: () => false },
    );

    expect(initialized).toBe(false);
    expect(emergencyLog).toHaveBeenCalledWith(
      expect.stringContaining('api.telemetry.initialization_failed'),
    );

    emergencyLog.mockRestore();
  });

  it('fails startup when enabled Sentry did not initialize', () => {
    expect(() => requireApiSentryInitialization(true, false)).toThrow(
      expect.objectContaining({ code: 'api_sentry_initialization_failed' }),
    );
    expect(() => requireApiSentryInitialization(true, true)).not.toThrow();
    expect(() => requireApiSentryInitialization(false, false)).not.toThrow();
  });
});

describe('API request metrics', () => {
  it('uses the route template and records count plus duration', () => {
    const increment = vi.fn();
    const observe = vi.fn();
    const times = [1_000_000_000n, 1_250_000_000n];
    const response = new EventEmitter() as EventEmitter & Response;
    response.statusCode = 204;
    const next = vi.fn();

    makeApiRequestMetrics({
      counters: { increment },
      measurements: { observe },
      now: () => times.shift()!,
    })(
      {
        method: 'PATCH',
        path: '/production/locations/east/shifts/00000000-0000-4000-8000-000000000001',
        baseUrl: '',
        route: {
          path: '/production/locations/:locationId/shifts/:productionShiftId',
        },
      } as Request,
      response,
      next,
    );
    response.emit('finish');

    const labels = {
      method: 'PATCH',
      route: '/production/locations/:locationId/shifts/:productionShiftId',
      status: '2xx',
      outcome: 'completed',
    };
    expect(next).toHaveBeenCalledOnce();
    expect(increment).toHaveBeenCalledWith('api.http_requests', labels);
    expect(observe).toHaveBeenCalledWith(
      'api.http_request_duration_seconds',
      0.25,
      labels,
    );

    response.emit('close');
    expect(increment).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledOnce();
  });

  it('records a connection closed before finish as aborted', () => {
    const increment = vi.fn();
    const observe = vi.fn();
    const times = [2_000_000_000n, 2_100_000_000n];
    const response = new EventEmitter() as EventEmitter & Response;
    response.statusCode = 200;

    makeApiRequestMetrics({
      counters: { increment },
      measurements: { observe },
      now: () => times.shift()!,
    })(
      {
        method: 'GET',
        baseUrl: '/production',
        route: { path: '/changes' },
      } as Request,
      response,
      vi.fn(),
    );
    response.emit('close');

    expect(increment).toHaveBeenCalledWith('api.http_requests', {
      method: 'GET',
      route: '/production/changes',
      status: '2xx',
      outcome: 'aborted',
    });
    expect(observe).toHaveBeenCalledWith(
      'api.http_request_duration_seconds',
      0.1,
      {
        method: 'GET',
        route: '/production/changes',
        status: '2xx',
        outcome: 'aborted',
      },
    );
  });

  it('canonicalizes mounted root routes and bounds unmatched paths', () => {
    expect(
      normalizedApiRoute({
        baseUrl: '/webhooks/cents',
        route: { path: '/' },
      } as Request),
    ).toBe('/webhooks/cents');

    expect(
      normalizedApiRoute({
        baseUrl: '',
        path: '/attacker-controlled/order-123',
      } as Request),
    ).toBe(unmatchedApiRoute);
  });

  it('maps count metrics to Sentry unitless and seconds to second', () => {
    const info = vi.fn();
    const warn = vi.fn();
    const count = vi.fn();
    const gauge = vi.fn();
    const distribution = vi.fn();
    const sinks = makeApiSignalSinks({
      logger: { info, warn } as unknown as Logger,
      catalog: presslyObservabilityCatalog,
      sentryEnabled: true,
      metricsEnabled: true,
      sentryMetrics: { count, gauge, distribution } as never,
    });

    sinks.counters.increment('api.http_requests', {
      runtime: 'worker',
      method: 'GET',
      route: '/production/locations/:locationId/workspace',
      status: '2xx',
      outcome: 'completed',
      callerSupplied: 'not-exported',
    });
    sinks.measurements.observe('api.http_request_duration_seconds', 0.125, {
      runtime: 'worker',
      method: 'GET',
      route: '/production/locations/:locationId/workspace',
      status: '2xx',
      outcome: 'completed',
    });

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(count).toHaveBeenCalledWith('api.http_requests', 1, {
      attributes: {
        runtime: 'api',
        method: 'GET',
        route: '/production/locations/:locationId/workspace',
        status: '2xx',
        outcome: 'completed',
      },
    });
    expect(count.mock.calls[0]?.[2]).not.toHaveProperty('unit');
    expect(distribution).toHaveBeenCalledWith(
      'api.http_request_duration_seconds',
      0.125,
      {
        unit: 'second',
        attributes: {
          runtime: 'api',
          method: 'GET',
          route: '/production/locations/:locationId/workspace',
          status: '2xx',
          outcome: 'completed',
        },
      },
    );
  });

  it('rate-limits metric export failure logs and never throws into requests', () => {
    const info = vi.fn();
    const warn = vi.fn();
    const count = vi.fn(() => {
      throw new Error('Sentry unavailable');
    });
    const sinks = makeApiSignalSinks({
      logger: { info, warn } as unknown as Logger,
      catalog: presslyObservabilityCatalog,
      sentryEnabled: true,
      metricsEnabled: true,
      sentryMetrics: {
        count,
        gauge: vi.fn(),
        distribution: vi.fn(),
      } as never,
      nowMs: () => 1_000,
      exportFailureLogIntervalMs: 60_000,
    });

    expect(() =>
      sinks.counters.increment('api.http_requests', {
        method: 'GET',
        route: '/health/ready',
        status: '2xx',
        outcome: 'completed',
      }),
    ).not.toThrow();
    expect(() =>
      sinks.counters.increment('api.http_requests', {
        method: 'GET',
        route: '/health/ready',
        status: '2xx',
        outcome: 'completed',
      }),
    ).not.toThrow();

    expect(count).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('exports only bounded order-route metadata to Sentry', () => {
    const info = vi.fn();
    const count = vi.fn();
    const sinks = makeApiSignalSinks({
      logger: { info, warn: vi.fn() } as unknown as Logger,
      catalog: presslyObservabilityCatalog,
      sentryEnabled: true,
      metricsEnabled: true,
      sentryMetrics: {
        count,
        gauge: vi.fn(),
        distribution: vi.fn(),
      } as never,
    });

    sinks.counters.increment('production.order_route_outcomes', {
      operation: 'preview',
      status: 'conflict',
      kind: 'exception',
      reason: 'needs_more_drying',
    });

    expect(info).not.toHaveBeenCalled();
    expect(count).toHaveBeenCalledWith('production.order_route_outcomes', 1, {
      attributes: {
        runtime: 'api',
        operation: 'preview',
        status: 'conflict',
        kind: 'exception',
        reason: 'needs_more_drying',
      },
    });
  });

  it('preserves dashboard operation labels and adds their stable operation ids', () => {
    const count = vi.fn();
    const sinks = makeApiSignalSinks({
      logger: { info: vi.fn(), warn: vi.fn() } as unknown as Logger,
      catalog: presslyObservabilityCatalog,
      sentryEnabled: true,
      metricsEnabled: true,
      sentryMetrics: {
        count,
        gauge: vi.fn(),
        distribution: vi.fn(),
      } as never,
    });

    sinks.counters.increment('db.transactions', {
      operation: 'production.advance_stage',
      outcome: 'committed',
    });

    expect(count).toHaveBeenCalledWith('db.transactions', 1, {
      attributes: {
        runtime: 'api',
        operation: 'production.advance_stage',
        outcome: 'committed',
        operation_id: 'production.advance-stage.v1',
      },
    });
  });
});
