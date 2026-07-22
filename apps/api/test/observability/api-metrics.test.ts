import { EventEmitter } from 'node:events';
import type { Logger } from '@pressly/logging';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { makeApiRequestMetrics } from '../../src/http/middleware/api-metrics.middleware.ts';
import {
  normalizedApiRoute,
  unmatchedApiRoute,
} from '../../src/http/middleware/api-route.ts';
import { makeApiSignalSinks } from '../../src/runtime/observability/sentry.ts';

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

  it('exports bounded Sentry metrics without high-volume log noise', () => {
    const info = vi.fn();
    const warn = vi.fn();
    const count = vi.fn();
    const gauge = vi.fn();
    const distribution = vi.fn();
    const sinks = makeApiSignalSinks({
      logger: { info, warn } as unknown as Logger,
      sentryEnabled: true,
      metricsEnabled: true,
      sentryMetrics: { count, gauge, distribution } as never,
    });

    sinks.counters.increment('api.http_requests', {
      method: 'GET',
      route: '/production/locations/:locationId/workspace',
      status: '2xx',
      outcome: 'completed',
      callerSupplied: 'not-exported',
    });
    sinks.measurements.observe('api.http_request_duration_seconds', 0.125, {
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

  it('exports only bounded order-route metadata to logs and Sentry', () => {
    const info = vi.fn();
    const count = vi.fn();
    const sinks = makeApiSignalSinks({
      logger: { info, warn: vi.fn() } as unknown as Logger,
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

    expect(info).toHaveBeenCalledWith('api counter incremented', {
      metric: 'production.order_route_outcomes',
      labels: {
        operation: 'preview',
        status: 'conflict',
        kind: 'exception',
        reason: 'needs_more_drying',
      },
      value: 1,
    });
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
});
