import type { JobHostRegistration } from '@pressly/jobs-host';
import { describe, expect, it, vi } from 'vitest';
import { makeDurableJobExecution } from '../../src/durable-execution.ts';

const registration = (
  queue: 'order_outbox' | 'webhook_ingestion',
): JobHostRegistration => ({
  operationId:
    queue === 'webhook_ingestion'
      ? 'ingress.process-inbound-event.v1'
      : 'production.apply-fulfillment-demand.v1',
  observability:
    queue === 'webhook_ingestion'
      ? 'ingress.process_inbound_event'
      : 'production.apply_fulfillment_demand',
  jobId:
    queue === 'webhook_ingestion'
      ? 'ingress.process-inbound-event-job.v1'
      : 'production.apply-fulfillment-demand-job.v1',
  trigger: 'message',
  queue,
  timeoutMs: null,
  retry: {
    maxAttempts: 8,
    strategy: 'bounded-exponential-jitter',
    deadLetter: 'retain',
  },
  invoke: async () => ({ kind: 'complete' }),
});

const harness = (
  input: {
    runtimeMaxAttempts?: number;
    jobs?: readonly JobHostRegistration[];
  } = {},
) => {
  const trace: string[] = [];
  const controller = new AbortController();
  const shutdown = vi.fn(async () => {
    trace.push('shutdown');
  });
  const invocation = (queue: 'order_outbox' | 'webhook_ingestion') => ({
    ...registration(queue),
    invoke: async () => {
      trace.push(`${queue}:invoke`);
      return { kind: 'complete' as const };
    },
  });
  const queue = (id: 'order_outbox' | 'webhook_ingestion') => ({
    id,
    claim: async () => {
      trace.push(`${id}:claim`);
      return [
        {
          id: `${id}-delivery`,
          attempt: 1,
          receipt: {},
          resolution: { kind: 'invoke' as const, payload: { demand: true } },
        },
      ];
    },
    complete: async () => {
      trace.push(`${id}:complete`);
      return { kind: 'applied' as const };
    },
    retry: async () => ({ kind: 'applied' as const }),
    deadLetter: async () => ({ kind: 'applied' as const }),
    afterPass: async () => void trace.push(`${id}:after-pass`),
  });
  const execution = makeDurableJobExecution({
    bindings: [
      {
        expected: {
          jobId: 'ingress.process-inbound-event-job.v1',
          queue: 'webhook_ingestion',
          maxAttempts: 8,
        },
        queue: queue('webhook_ingestion'),
      },
      {
        expected: {
          jobId: 'production.apply-fulfillment-demand-job.v1',
          queue: 'order_outbox',
          maxAttempts: 8,
        },
        queue: queue('order_outbox'),
      },
    ],
    runtimeMaxAttempts: input.runtimeMaxAttempts ?? 8,
    pollIntervalMs: 1_000,
    loopRetryBaseMs: 1_000,
    loopRetryMaxMs: 30_000,
    deliveryRetryBaseMs: 1_000,
    deliveryRetryMaxMs: 300_000,
    heartbeat: {
      beat: async () => {
        trace.push('heartbeat');
        controller.abort();
      },
    },
    now: () => new Date('2026-08-22T16:00:00.000Z'),
    nowNanoseconds: () => 1n,
    random: () => 0.5,
    observer: { record: vi.fn() },
    classifyUnexpected: () => ({
      code: 'unexpected',
      message: 'Unexpected.',
      retryable: true,
    }),
    shutdowns: [shutdown],
  });
  return {
    execution,
    jobs: input.jobs ?? [
      invocation('webhook_ingestion'),
      invocation('order_outbox'),
    ],
    controller,
    trace,
    shutdown,
  };
};

describe('Worker topology-job execution', () => {
  it('runs webhook first and order_outbox second in one pass', async () => {
    const run = harness();
    await run.execution.run({
      jobs: run.jobs,
      signal: run.controller.signal,
    });
    expect(run.trace).toEqual([
      'webhook_ingestion:claim',
      'webhook_ingestion:invoke',
      'webhook_ingestion:complete',
      'webhook_ingestion:after-pass',
      'order_outbox:claim',
      'order_outbox:invoke',
      'order_outbox:complete',
      'order_outbox:after-pass',
      'heartbeat',
    ]);
  });

  it('rejects runtime max-attempt disagreement before either job executes', async () => {
    const run = harness({ runtimeMaxAttempts: 7 });
    await expect(
      run.execution.run({
        jobs: run.jobs,
        signal: run.controller.signal,
      }),
    ).rejects.toMatchObject({
      code: 'worker_job_max_attempts_mismatch',
    });
    expect(run.trace).toEqual([]);
  });

  it.each([
    { count: 0, jobs: [] as readonly JobHostRegistration[] },
    { count: 1, jobs: [registration('order_outbox')] },
    {
      count: 3,
      jobs: [
        registration('webhook_ingestion'),
        registration('order_outbox'),
        registration('order_outbox'),
      ],
    },
  ])(
    'rejects a topology catalog containing $count registrations',
    async ({ jobs }) => {
      const run = harness({ jobs });
      await expect(
        run.execution.run({ jobs, signal: run.controller.signal }),
      ).rejects.toMatchObject({ code: 'worker_job_catalog_invalid' });
      expect(run.trace).toEqual([]);
    },
  );

  it('rejects a wrong queue binding before one pass starts', async () => {
    const wrong = {
      ...registration('webhook_ingestion'),
      queue: 'other_queue',
    };
    const jobs = [wrong, registration('order_outbox')];
    const run = harness({ jobs });
    await expect(
      run.execution.run({ jobs, signal: run.controller.signal }),
    ).rejects.toMatchObject({ code: 'worker_job_registration_invalid' });
    expect(run.trace).toEqual([]);
  });

  it('uses the S1 aggregate shutdown path', async () => {
    const run = harness();
    await run.execution.shutdown();
    expect(run.shutdown).toHaveBeenCalledOnce();
    expect(run.trace).toEqual(['shutdown']);
  });
});
