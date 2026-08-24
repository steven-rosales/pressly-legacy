import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '@pressly/logging';
import { makeWorkerDurableJobObserver } from '../../src/runtime/observability/durable-jobs.observer.ts';

const harness = () => {
  const logger: Logger = {
    child: () => logger,
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  };
  const counters = { increment: vi.fn() };
  const measurements = { observe: vi.fn() };
  const errors = { capture: vi.fn(), shutdown: vi.fn() };
  return {
    observer: makeWorkerDurableJobObserver({
      logger,
      counters,
      measurements,
      errors,
    }),
    logger,
    counters,
    measurements,
    errors,
  };
};

describe('Worker durable-job observation adapter', () => {
  it('maps sampled target passes to the deployed job counters and duration', () => {
    const run = harness();
    run.observer.record({
      kind: 'queue-pass',
      jobId: 'production.apply-fulfillment-demand-job.v1',
      queueId: 'order_outbox',
      outcome: 'busy',
      processed: 2,
      durationSeconds: 0.25,
    });
    expect(run.counters.increment).toHaveBeenCalledWith('worker.job_passes', {
      job: 'order_outbox',
      outcome: 'busy',
    });
    expect(run.measurements.observe).toHaveBeenCalledWith(
      'worker.job_pass_duration_seconds',
      0.25,
      { job: 'order_outbox', outcome: 'busy' },
    );
  });

  it('leaves delivery transition presentation to the queue adapter', () => {
    const run = harness();
    run.observer.record({
      kind: 'delivery-transition',
      jobId: 'production.apply-fulfillment-demand-job.v1',
      queueId: 'order_outbox',
      deliveryId: 'delivery-1',
      attempted: 'retry',
      outcome: 'lease-lost',
      code: 'database_unavailable',
      delayMs: 750,
    });
    expect(run.counters.increment).not.toHaveBeenCalled();
    expect(run.logger.warn).not.toHaveBeenCalled();
  });

  it('reports the first loop failure and keeps later warning cadence', () => {
    const run = harness();
    run.observer.record({
      kind: 'loop-failure',
      consecutiveFailures: 1,
      retryDelayMs: 1_000,
      failure: { fault: 'database unavailable' },
    });
    expect(run.errors.capture).toHaveBeenCalledOnce();

    run.observer.record({
      kind: 'loop-failure',
      consecutiveFailures: 2,
      retryDelayMs: 2_000,
      failure: { fault: 'database unavailable' },
    });
    run.observer.record({
      kind: 'loop-failure',
      consecutiveFailures: 3,
      retryDelayMs: 4_000,
      failure: { fault: 'database unavailable' },
    });
    expect(run.counters.increment).toHaveBeenCalledWith(
      'worker.loop_failures',
      { operation: 'worker_loop' },
    );
    expect(run.logger.warn).toHaveBeenCalledTimes(1);
    expect(run.logger.warn).toHaveBeenCalledWith(
      'worker loop remains unavailable',
      { consecutiveFailures: 2, retryDelayMs: 2_000 },
    );
  });
});
