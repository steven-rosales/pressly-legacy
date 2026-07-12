import type { Logger } from '@pressly/logging';
import { describe, expect, it, vi } from 'vitest';
import {
  initializeWorkerSentry,
  makeWorkerSentryHeartbeat,
  makeWorkerSignalSinks,
  reportWorkerFailure,
  workerHeartbeatMonitorSlug,
} from '../../src/common/observability.ts';

describe('worker signal sinks', () => {
  it('exports low-cardinality Sentry metrics and rate-limits measurements', () => {
    const info = vi.fn();
    const count = vi.fn();
    const gauge = vi.fn();
    const distribution = vi.fn();
    let now = new Date('2026-07-12T16:00:00.000Z');
    const sinks = makeWorkerSignalSinks({
      logger: { info, warn: vi.fn() } as unknown as Logger,
      clock: { now: () => now },
      measurementLogIntervalMs: 60_000,
      sentryEnabled: true,
      sentryMetrics: { count, gauge, distribution },
    });

    sinks.counters.increment('worker.jobs_retried', {
      job: 'cents_projection',
      receipt_id: 'must-not-be-exported',
      token: 'must-not-be-exported',
    });
    sinks.measurements.observe('worker.inbox_pending_count', 2, {
      job: 'cents_projection',
    });
    sinks.measurements.observe('worker.inbox_pending_count', 1, {
      job: 'cents_projection',
    });
    sinks.measurements.observe('worker.inbox_oldest_pending_age_seconds', 130, {
      job: 'cents_projection',
    });
    sinks.measurements.observe('worker.processing_latency_seconds', 0.25, {
      job: 'cents_projection',
    });
    now = new Date(now.getTime() + 60_000);
    sinks.measurements.observe('worker.inbox_pending_count', 1, {
      job: 'cents_projection',
    });

    expect(info).toHaveBeenCalledTimes(5);
    expect(info.mock.calls.map(([message]) => message)).toEqual([
      'worker counter incremented',
      'worker measurement observed',
      'worker measurement observed',
      'worker measurement observed',
      'worker measurement observed',
    ]);
    expect(count).toHaveBeenCalledWith('worker.jobs_retried', 1, {
      attributes: { runtime: 'worker', job: 'cents_projection' },
    });
    expect(gauge).toHaveBeenCalledTimes(3);
    expect(gauge).toHaveBeenCalledWith(
      'worker.inbox_oldest_pending_age_seconds',
      130,
      {
        attributes: { runtime: 'worker', job: 'cents_projection' },
        unit: 'second',
      },
    );
    expect(gauge).toHaveBeenLastCalledWith('worker.inbox_pending_count', 1, {
      attributes: { runtime: 'worker', job: 'cents_projection' },
    });
    expect(distribution).toHaveBeenCalledWith(
      'worker.processing_latency_seconds',
      0.25,
      {
        attributes: { runtime: 'worker', job: 'cents_projection' },
        unit: 'second',
      },
    );
  });

  it('enables Sentry metrics without contacting Sentry in the test', () => {
    const initialize = vi.fn();

    initializeWorkerSentry(
      {
        enabled: true,
        dsn: 'https://public@example.com/1',
        environment: 'test',
        release: 'worker-test',
        traceSampleRate: 0,
      },
      initialize,
    );

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ enableMetrics: true, sendDefaultPii: false }),
    );
  });

  it('rate-limits successful Sentry heartbeat check-ins', async () => {
    const beat = vi.fn(async () => undefined);
    const captureCheckIn = vi.fn(() => 'check-in-id');
    let now = new Date('2026-07-12T16:00:00.000Z');
    const heartbeat = makeWorkerSentryHeartbeat({
      heartbeat: { beat },
      logger: { warn: vi.fn() } as unknown as Logger,
      sentryEnabled: true,
      clock: { now: () => now },
      captureCheckIn,
    });

    await heartbeat.beat();
    now = new Date(now.getTime() + 30_000);
    await heartbeat.beat();
    now = new Date(now.getTime() + 30_000);
    await heartbeat.beat();

    expect(beat).toHaveBeenCalledTimes(3);
    expect(captureCheckIn).toHaveBeenCalledTimes(2);
    expect(captureCheckIn).toHaveBeenLastCalledWith(
      { monitorSlug: workerHeartbeatMonitorSlug, status: 'ok' },
      {
        schedule: { type: 'interval', value: 1, unit: 'minute' },
        checkinMargin: 1,
        maxRuntime: 1,
        failureIssueThreshold: 1,
        recoveryThreshold: 1,
        timezone: 'UTC',
      },
    );
  });

  it('does not let a failed Sentry check-in make the worker unhealthy', async () => {
    const warn = vi.fn();
    const heartbeat = makeWorkerSentryHeartbeat({
      heartbeat: { beat: vi.fn(async () => undefined) },
      logger: { warn } as unknown as Logger,
      sentryEnabled: true,
      captureCheckIn: () => {
        throw new Error('transport unavailable');
      },
    });

    await expect(heartbeat.beat()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      'worker heartbeat check-in failed',
      expect.objectContaining({ error: expect.any(Object) }),
    );
  });

  it('exports fatal loop failures while preserving error capture', () => {
    const count = vi.fn();
    const capture = vi.fn();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    } as unknown as Logger;
    const sinks = makeWorkerSignalSinks({
      logger,
      measurementLogIntervalMs: 60_000,
      sentryEnabled: true,
      sentryMetrics: { count, gauge: vi.fn(), distribution: vi.fn() },
    });

    reportWorkerFailure({
      error: new Error('runtime unavailable'),
      operation: 'worker_runtime',
      logger,
      counters: sinks.counters,
      errors: { capture, shutdown: async () => undefined },
      level: 'fatal',
    });

    expect(count).toHaveBeenCalledWith('worker.loop_failures', 1, {
      attributes: { runtime: 'worker', operation: 'worker_runtime' },
    });
    expect(capture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        source: 'worker',
        operation: 'worker_runtime',
      }),
    );
    expect(logger.fatal).toHaveBeenCalledOnce();
  });
});
