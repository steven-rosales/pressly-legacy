import { isAppError } from '@pressly/errors/app-error';
import type { TraceSink, TraceSpan } from '@pressly/observability';
import { describe, expect, it, vi } from 'vitest';
import { makeSequentialJob, observeWorkerJob } from '../../src/runtime/job.ts';

const makeTrace = (): Readonly<{
  trace: TraceSink;
  definitions: unknown[];
  setAttribute: ReturnType<typeof vi.fn>;
  setStatus: ReturnType<typeof vi.fn>;
}> => {
  const definitions: unknown[] = [];
  const setAttribute = vi.fn();
  const setStatus = vi.fn();
  const span: TraceSpan = { setAttribute, setStatus };

  return {
    definitions,
    setAttribute,
    setStatus,
    trace: {
      startActiveSpan: async (definition, work) => {
        definitions.push(definition);
        return work(span);
      },
    },
  };
};

describe('observed worker job', () => {
  it('records every busy pass with duration, batch size, and an active span', async () => {
    const increment = vi.fn();
    const observe = vi.fn();
    const tracing = makeTrace();
    const times = [1_000_000_000n, 3_500_000_000n];
    const job = observeWorkerJob({
      name: 'order_outbox',
      job: { runOnce: async () => 4 },
      counters: { increment },
      measurements: { observe },
      trace: tracing.trace,
      nowNanoseconds: () => times.shift() ?? 3_500_000_000n,
    });

    await expect(job.runOnce()).resolves.toBe(4);

    expect(tracing.definitions).toEqual([
      {
        name: 'order_outbox',
        operation: 'worker.job',
        attributes: { job: 'order_outbox' },
      },
    ]);
    expect(increment).toHaveBeenCalledWith('worker.job_passes', {
      job: 'order_outbox',
      outcome: 'busy',
    });
    expect(observe).toHaveBeenCalledWith(
      'worker.job_pass_duration_seconds',
      2.5,
      { job: 'order_outbox', outcome: 'busy' },
    );
    expect(tracing.setAttribute).toHaveBeenCalledWith('batch_size', 4);
    expect(tracing.setStatus).toHaveBeenCalledWith('ok');
  });

  it('samples successful idle pass metrics at most once per minute', async () => {
    const increment = vi.fn();
    const observe = vi.fn();
    const times = [
      0n,
      1_000_000_000n,
      10_000_000_000n,
      11_000_000_000n,
      61_000_000_000n,
      62_000_000_000n,
    ];
    const job = observeWorkerJob({
      name: 'webhook_ingestion',
      job: { runOnce: async () => 0 },
      counters: { increment },
      measurements: { observe },
      nowNanoseconds: () => times.shift() ?? 62_000_000_000n,
    });

    await job.runOnce();
    await job.runOnce();
    await job.runOnce();

    expect(increment).toHaveBeenCalledTimes(2);
    expect(observe).toHaveBeenCalledTimes(2);
  });

  it('records a failed pass and rethrows the identical error', async () => {
    const failure = new Error('database unavailable');
    const increment = vi.fn();
    const observe = vi.fn();
    const tracing = makeTrace();
    const times = [5_000_000_000n, 6_000_000_000n];
    const job = observeWorkerJob({
      name: 'order_outbox',
      job: { runOnce: async () => Promise.reject(failure) },
      counters: { increment },
      measurements: { observe },
      trace: tracing.trace,
      nowNanoseconds: () => times.shift() ?? 6_000_000_000n,
    });

    await expect(job.runOnce()).rejects.toBe(failure);
    expect(increment).toHaveBeenCalledWith('worker.job_passes', {
      job: 'order_outbox',
      outcome: 'failed',
    });
    expect(observe).toHaveBeenCalledWith(
      'worker.job_pass_duration_seconds',
      1,
      { job: 'order_outbox', outcome: 'failed' },
    );
    expect(tracing.setStatus).toHaveBeenCalledWith('error');
  });
});

describe('sequential worker job', () => {
  it('runs later independent jobs before propagating the first failure', async () => {
    const failure = new Error('first job failed');
    const later = vi.fn(async () => 2);
    const job = makeSequentialJob([
      { runOnce: async () => Promise.reject(failure) },
      { runOnce: later },
    ]);

    await expect(job.runOnce()).rejects.toBe(failure);
    expect(later).toHaveBeenCalledOnce();
  });

  it('sums successful jobs', async () => {
    const job = makeSequentialJob([
      { runOnce: async () => 2 },
      { runOnce: async () => 3 },
    ]);

    await expect(job.runOnce()).resolves.toBe(5);
  });

  it('preserves every independent failure from the same pass', async () => {
    const first = new Error('first job failed');
    const second = new Error('second job failed');
    const job = makeSequentialJob([
      { runOnce: async () => Promise.reject(first) },
      { runOnce: async () => Promise.reject(second) },
    ]);

    const failure = await job.runOnce().catch((error: unknown) => error);

    expect(isAppError(failure)).toBe(true);
    expect(failure).toMatchObject({
      code: 'worker_peer_jobs_failed',
      details: { failureCount: 2 },
      cause: expect.any(AggregateError),
    });
    expect((failure as Error & { cause: AggregateError }).cause.errors).toEqual(
      [first, second],
    );
  });
});
