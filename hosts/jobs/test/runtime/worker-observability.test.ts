import type { Logger } from '@pressly/logging';
import { makeAppError, isAppError } from '@pressly/errors/app-error';
import { describe, expect, it, vi } from 'vitest';
import {
  initializeWorkerSentry,
  makeWorkerSentryHeartbeat,
  makeWorkerSignalSinks,
  makeWorkerTracesSampler,
  makeWorkerTransactionFilter,
  reportWorkerFailure,
  requireWorkerSentryInitialization,
  sanitizeWorkerError,
  workerHeartbeatMonitorSlug,
} from '../../src/runtime/observability/worker-observability.ts';

const workerTransaction = (input: {
  job: string;
  outcome: 'busy' | 'idle' | 'failed';
}) =>
  ({
    type: 'transaction' as const,
    transaction: input.job,
    contexts: {
      trace: {
        trace_id: '1'.repeat(32),
        span_id: '2'.repeat(16),
        op: 'worker.job',
        data: input,
      },
    },
  }) as const;

describe('worker signal sinks', () => {
  it('redacts diagnostics while preserving structured identity and cause', () => {
    const failure = makeAppError({
      kind: 'DatabaseError',
      code: 'database_unavailable',
      message: 'database secret diagnostics',
      safeMessage: 'Storage is temporarily unavailable.',
      status: 503,
      cause: new Error('socket unavailable'),
    });

    const sanitized = sanitizeWorkerError(failure);

    expect(isAppError(sanitized)).toBe(true);
    expect(sanitized).toMatchObject({
      kind: 'DatabaseError',
      code: 'database_unavailable',
      message: 'Storage is temporarily unavailable.',
    });
    expect(sanitized.cause).toBeInstanceOf(Error);
  });

  it('preserves every sanitized aggregate member', () => {
    const aggregate = new AggregateError(
      [
        makeAppError({
          kind: 'DatabaseError',
          code: 'database_unavailable',
          message: 'private database diagnostics',
          safeMessage: 'Storage is temporarily unavailable.',
          status: 503,
        }),
        new Error('second failure'),
      ],
      'two jobs failed',
    );

    const sanitized = sanitizeWorkerError(aggregate);

    expect(sanitized).toBeInstanceOf(AggregateError);
    expect((sanitized as AggregateError).errors).toHaveLength(2);
    expect(isAppError((sanitized as AggregateError).errors[0])).toBe(true);
    expect((sanitized as AggregateError).errors[0]).toMatchObject({
      code: 'database_unavailable',
      message: 'Storage is temporarily unavailable.',
    });
  });

  it('maps count metrics to Sentry unitless and seconds to second', () => {
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
      runtime: 'api',
      job: 'webhook_ingestion',
      receipt_id: 'must-not-be-exported',
      token: 'must-not-be-exported',
    });
    sinks.measurements.observe('worker.inbox_pending_count', 2, {
      job: 'webhook_ingestion',
    });
    sinks.measurements.observe('worker.inbox_pending_count', 1, {
      job: 'webhook_ingestion',
    });
    sinks.measurements.observe('worker.inbox_oldest_pending_age_seconds', 130, {
      job: 'webhook_ingestion',
    });
    sinks.measurements.observe('worker.processing_latency_seconds', 0.25, {
      job: 'webhook_ingestion',
    });
    now = new Date(now.getTime() + 60_000);
    sinks.measurements.observe('worker.inbox_pending_count', 1, {
      job: 'webhook_ingestion',
    });

    expect(info).not.toHaveBeenCalled();
    expect(count).toHaveBeenCalledWith('worker.jobs_retried', 1, {
      attributes: {
        runtime: 'worker',
        job: 'webhook_ingestion',
        operation_id: 'ingress.process-inbound-event.v1',
      },
    });
    expect(count.mock.calls[0]?.[2]).not.toHaveProperty('unit');
    expect(gauge).toHaveBeenCalledTimes(4);
    expect(gauge).toHaveBeenCalledWith(
      'worker.inbox_oldest_pending_age_seconds',
      130,
      {
        attributes: {
          runtime: 'worker',
          job: 'webhook_ingestion',
          operation_id: 'ingress.process-inbound-event.v1',
        },
        unit: 'second',
      },
    );
    expect(gauge).toHaveBeenLastCalledWith('worker.inbox_pending_count', 1, {
      attributes: {
        runtime: 'worker',
        job: 'webhook_ingestion',
        operation_id: 'ingress.process-inbound-event.v1',
      },
    });
    expect(distribution).toHaveBeenCalledWith(
      'worker.processing_latency_seconds',
      0.25,
      {
        attributes: {
          runtime: 'worker',
          job: 'webhook_ingestion',
          operation_id: 'ingress.process-inbound-event.v1',
        },
        unit: 'second',
      },
    );
  });

  it('preserves the order-outbox job label and adds its stable operation id', () => {
    const count = vi.fn();
    const sinks = makeWorkerSignalSinks({
      logger: { info: vi.fn(), warn: vi.fn() } as unknown as Logger,
      measurementLogIntervalMs: 60_000,
      sentryEnabled: true,
      sentryMetrics: { count, gauge: vi.fn(), distribution: vi.fn() },
    });

    sinks.counters.increment('worker.jobs_completed', {
      job: 'order_outbox',
    });

    expect(count).toHaveBeenCalledWith('worker.jobs_completed', 1, {
      attributes: {
        runtime: 'worker',
        job: 'order_outbox',
        operation_id: 'production.apply-fulfillment-demand.v1',
      },
    });
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
      { initialize, hasInitializedDsn: () => true },
    );

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        enableLogs: true,
        enableMetrics: true,
        sendDefaultPii: false,
        tracesSampler: expect.any(Function),
        beforeSendTransaction: expect.any(Function),
      }),
    );
  });

  it('rejects an invalid DSN before initializing the SDK', () => {
    const initialize = vi.fn();
    const emergencyLog = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const initialized = initializeWorkerSentry(
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
      expect.stringContaining('worker.telemetry.initialization_failed'),
    );

    emergencyLog.mockRestore();
  });

  it('remains unavailable when the SDK creates no DSN-backed client', () => {
    const emergencyLog = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const initialized = initializeWorkerSentry(
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
      expect.stringContaining('worker.telemetry.initialization_failed'),
    );

    emergencyLog.mockRestore();
  });

  it('fails startup when enabled Sentry did not initialize', () => {
    expect(() => requireWorkerSentryInitialization(true, false)).toThrow(
      expect.objectContaining({ code: 'worker_sentry_initialization_failed' }),
    );
    expect(() => requireWorkerSentryInitialization(true, true)).not.toThrow();
    expect(() => requireWorkerSentryInitialization(false, false)).not.toThrow();
  });

  it('keeps every busy and failed job transaction while sampling idle per job', () => {
    const times = [0n, 1n, 30_000_000_000n, 60_000_000_000n];
    const filter = makeWorkerTransactionFilter({
      nowNanoseconds: () => times.shift() ?? 60_000_000_000n,
    });
    const webhookIdle = workerTransaction({
      job: 'webhook_ingestion',
      outcome: 'idle',
    });
    const outboxIdle = workerTransaction({
      job: 'order_outbox',
      outcome: 'idle',
    });
    const busy = workerTransaction({
      job: 'webhook_ingestion',
      outcome: 'busy',
    });
    const failed = workerTransaction({
      job: 'order_outbox',
      outcome: 'failed',
    });
    const other = {
      ...webhookIdle,
      contexts: {
        trace: {
          ...webhookIdle.contexts.trace,
          op: 'http.server',
        },
      },
    } as const;

    expect(filter(webhookIdle, {})).toBe(webhookIdle);
    expect(filter(outboxIdle, {})).toBe(outboxIdle);
    expect(filter(webhookIdle, {})).toBeNull();
    expect(filter(busy, {})).toBe(busy);
    expect(filter(failed, {})).toBe(failed);
    expect(filter(other, {})).toBe(other);
    expect(filter(webhookIdle, {})).toBe(webhookIdle);
  });

  it('records worker job roots before their outcome and preserves other trace sampling', () => {
    const sampler = makeWorkerTracesSampler(0.2);
    const inheritOrSampleWith = vi.fn(() => 0.4);

    expect(
      sampler({
        name: 'order_outbox',
        attributes: { 'pressly.trace.operation': 'worker.job' },
        inheritOrSampleWith,
      }),
    ).toBe(1);
    expect(
      sampler({
        name: 'GET /health',
        attributes: { 'pressly.trace.operation': 'http.server' },
        inheritOrSampleWith,
      }),
    ).toBe(0.4);
    expect(inheritOrSampleWith).toHaveBeenCalledOnce();
    expect(inheritOrSampleWith).toHaveBeenCalledWith(0.2);
  });

  it('preserves an explicit tracing-off configuration for worker jobs', () => {
    const sampler = makeWorkerTracesSampler(0);

    expect(
      sampler({
        name: 'order_outbox',
        attributes: { 'pressly.trace.operation': 'worker.job' },
        inheritOrSampleWith: vi.fn(() => 1),
      }),
    ).toBe(0);
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

  it('does not let failing observation sinks escape runtime reporting', () => {
    const fail = () => {
      throw new Error('sink unavailable');
    };

    expect(() =>
      reportWorkerFailure({
        error: new Error('runtime unavailable'),
        operation: 'worker_runtime',
        logger: { error: fail } as unknown as Logger,
        counters: { increment: fail },
        errors: { capture: fail, shutdown: async () => undefined },
      }),
    ).not.toThrow();
  });
});
