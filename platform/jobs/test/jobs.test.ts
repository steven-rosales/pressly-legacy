import { isAppError } from '@pressly/errors/app-error';
import { unexpectedError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import type {
  ClaimedDurableJobDelivery,
  DurableJobFailure,
  DurableJobObserver,
  DurableJobQueue,
  DurableJobRetryPolicy,
  InvokableJobRegistration,
} from '../src/public.ts';
import {
  boundedExponentialJitterDelayMs,
  makeDurableQueueJob,
  makeSequentialDurableJob,
  runDurableJobLoop,
  shutdownDurableJobResources,
} from '../src/public.ts';

const applied = Object.freeze({ kind: 'applied' as const });
const leaseLost = Object.freeze({ kind: 'lease-lost' as const });

const retryPolicy: DurableJobRetryPolicy = Object.freeze({
  maxAttempts: 8,
  strategy: 'bounded-exponential-jitter',
  deadLetter: 'retain',
});

const delivery = (
  id: string,
  attempt: number,
  resolution: ClaimedDurableJobDelivery['resolution'],
): ClaimedDurableJobDelivery =>
  Object.freeze({ id, attempt, receipt: { id }, resolution });

const makeQueue = (
  deliveries: readonly ClaimedDurableJobDelivery[],
  outcomes: Readonly<{
    complete?: typeof applied | typeof leaseLost;
    retry?: typeof applied | typeof leaseLost;
    deadLetter?: typeof applied | typeof leaseLost;
    afterPass?: () => Promise<void>;
  }> = {},
) => {
  const claim = vi.fn<DurableJobQueue['claim']>(async () => deliveries);
  const complete = vi.fn<DurableJobQueue['complete']>(
    async () => outcomes.complete ?? applied,
  );
  const retry = vi.fn<DurableJobQueue['retry']>(
    async () => outcomes.retry ?? applied,
  );
  const deadLetter = vi.fn<DurableJobQueue['deadLetter']>(
    async () => outcomes.deadLetter ?? applied,
  );
  const afterPass = vi.fn(outcomes.afterPass ?? (async () => undefined));
  const queue: DurableJobQueue = Object.freeze({
    id: 'queue-a',
    claim,
    complete,
    retry,
    deadLetter,
    afterPass,
  });

  return { queue, claim, complete, retry, deadLetter, afterPass };
};

const registration = (
  invoke: InvokableJobRegistration['invoke'],
  input: Readonly<{
    retry?: DurableJobRetryPolicy | null;
    timeoutMs?: number | null;
  }> = {},
): InvokableJobRegistration =>
  Object.freeze({
    jobId: 'job-a',
    timeoutMs: input.timeoutMs ?? null,
    retry: input.retry === undefined ? retryPolicy : input.retry,
    invoke,
  });

const makeJob = (
  input: Readonly<{
    queue: DurableJobQueue;
    invoke?: InvokableJobRegistration['invoke'];
    retry?: DurableJobRetryPolicy | null;
    timeoutMs?: number | null;
    classifyUnexpected?: (failure: unknown) => DurableJobFailure;
    now?: () => Date;
    nowNanoseconds?: () => bigint;
    random?: () => number;
    observer?: DurableJobObserver;
  }>,
) =>
  makeDurableQueueJob({
    job: registration(
      input.invoke ?? (async () => ({ kind: 'complete' as const })),
      {
        retry: input.retry === undefined ? retryPolicy : input.retry,
        timeoutMs: input.timeoutMs ?? null,
      },
    ),
    queue: input.queue,
    classifyUnexpected:
      input.classifyUnexpected ??
      (() => ({
        code: 'unexpected_job_failure',
        message: 'Unexpected job failure.',
        retryable: true,
      })),
    retryBaseMs: 100,
    retryMaxMs: 1_000,
    now: input.now ?? (() => new Date('2026-08-22T12:00:00.000Z')),
    ...(input.nowNanoseconds === undefined
      ? {}
      : { nowNanoseconds: input.nowNanoseconds }),
    random: input.random ?? (() => 0.5),
    ...(input.observer === undefined ? {} : { observer: input.observer }),
  });

describe('durable delivery execution', () => {
  it('requires the retry policy declared by the registration', () => {
    const queue = makeQueue([]);

    expect(() => makeJob({ queue: queue.queue, retry: null })).toThrowError(
      expect.objectContaining({ code: 'durable_job_retry_policy_missing' }),
    );
  });

  it('resolves invoke, complete-without-invoke, and pre-invoke rejection generically', async () => {
    const permanent: DurableJobFailure = {
      code: 'payload_invalid',
      message: 'The payload is invalid.',
      retryable: false,
    };
    const deliveries = [
      delivery('invoke', 1, { kind: 'invoke', payload: { value: 1 } }),
      delivery('filtered', 1, { kind: 'complete-without-invoke' }),
      delivery('invalid', 1, { kind: 'reject', failure: permanent }),
    ];
    const queue = makeQueue(deliveries);
    const invoke = vi.fn<InvokableJobRegistration['invoke']>(async () => ({
      kind: 'complete' as const,
    }));

    await expect(
      makeJob({ queue: queue.queue, invoke }).runOnce(
        new AbortController().signal,
      ),
    ).resolves.toBe(3);

    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke.mock.calls[0]?.[0]).toEqual({ value: 1 });
    expect(invoke.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
    expect(queue.complete.mock.calls.map(([claimed]) => claimed.id)).toEqual([
      'invoke',
      'filtered',
    ]);
    expect(queue.retry).not.toHaveBeenCalled();
    expect(queue.deadLetter).toHaveBeenCalledWith({
      delivery: deliveries[2],
      failure: permanent,
      retention: 'retain',
    });
  });

  it('uses exact bounded exponential plus or minus 25 percent rounded jitter', () => {
    expect(
      boundedExponentialJitterDelayMs({
        attempt: 1,
        baseMs: 101,
        maxMs: 1_000,
        jitter: 0,
      }),
    ).toBe(76);
    expect(
      boundedExponentialJitterDelayMs({
        attempt: 2,
        baseMs: 100,
        maxMs: 1_000,
        jitter: 0.5,
      }),
    ).toBe(200);
    expect(
      boundedExponentialJitterDelayMs({
        attempt: 6,
        baseMs: 100,
        maxMs: 1_000,
        jitter: 1,
      }),
    ).toBe(1_250);
  });

  it('schedules a retry from the durable attempt and injected clock', async () => {
    const retryable: DurableJobFailure = {
      code: 'database_unavailable',
      message: 'The database is unavailable.',
      retryable: true,
    };
    const claimed = delivery('retry', 2, {
      kind: 'reject',
      failure: retryable,
    });
    const queue = makeQueue([claimed]);

    await makeJob({ queue: queue.queue, random: () => 0 }).runOnce(
      new AbortController().signal,
    );

    expect(queue.retry).toHaveBeenCalledWith({
      delivery: claimed,
      availableAt: new Date('2026-08-22T12:00:00.150Z'),
      delayMs: 150,
      failure: retryable,
    });
    expect(queue.deadLetter).not.toHaveBeenCalled();
  });

  it('makes attempt eight terminal even for a retryable failure', async () => {
    const retryable: DurableJobFailure = {
      code: 'database_unavailable',
      message: 'The database is unavailable.',
      retryable: true,
    };
    const claimed = delivery('terminal', 8, {
      kind: 'reject',
      failure: retryable,
    });
    const queue = makeQueue([claimed]);

    await makeJob({ queue: queue.queue }).runOnce(new AbortController().signal);

    expect(queue.retry).not.toHaveBeenCalled();
    expect(queue.deadLetter).toHaveBeenCalledWith({
      delivery: claimed,
      failure: retryable,
      retention: 'retain',
    });
  });

  it('treats complete, retry, and dead-letter lease loss as resolved queue outcomes', async () => {
    const retryable: DurableJobFailure = {
      code: 'temporary',
      message: 'Temporary failure.',
      retryable: true,
    };
    const permanent: DurableJobFailure = {
      code: 'permanent',
      message: 'Permanent failure.',
      retryable: false,
    };
    const observations: unknown[] = [];
    const queue = makeQueue(
      [
        delivery('complete', 1, { kind: 'complete-without-invoke' }),
        delivery('retry', 1, { kind: 'reject', failure: retryable }),
        delivery('dead', 1, { kind: 'reject', failure: permanent }),
      ],
      {
        complete: leaseLost,
        retry: leaseLost,
        deadLetter: leaseLost,
      },
    );

    await expect(
      makeJob({
        queue: queue.queue,
        observer: { record: (value) => observations.push(value) },
      }).runOnce(new AbortController().signal),
    ).resolves.toBe(3);

    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'delivery-transition',
          attempted: 'complete',
          outcome: 'lease-lost',
        }),
        expect.objectContaining({
          kind: 'delivery-transition',
          attempted: 'retry',
          outcome: 'lease-lost',
        }),
        expect.objectContaining({
          kind: 'delivery-transition',
          attempted: 'dead-letter',
          outcome: 'lease-lost',
        }),
      ]),
    );
  });

  it('classifies a thrown invocation failure through the injected disposition', async () => {
    const thrown = unexpectedError({
      code: 'database_unavailable',
      message: 'Database unavailable.',
    });
    const classifyUnexpected = vi.fn(() => ({
      code: thrown.code,
      message: thrown.safeMessage,
      retryable: true,
    }));
    const queue = makeQueue([
      delivery('invoke', 1, { kind: 'invoke', payload: {} }),
    ]);

    await makeJob({
      queue: queue.queue,
      invoke: async () => Promise.reject(thrown),
      classifyUnexpected,
    }).runOnce(new AbortController().signal);

    expect(classifyUnexpected).toHaveBeenCalledWith(thrown);
    expect(queue.retry).toHaveBeenCalledWith(
      expect.objectContaining({
        failure: {
          code: 'database_unavailable',
          message: 'An unexpected error occurred.',
          retryable: true,
        },
      }),
    );
  });

  it('enforces a declared timeout without detaching an invocation that ignores its signal', async () => {
    vi.useFakeTimers();
    try {
      let invocationSignal: AbortSignal | undefined;
      let release: (() => void) | undefined;
      let settled = false;
      const classifyUnexpected = vi.fn((failure: unknown) => ({
        code:
          isAppError(failure) && failure.code === 'durable_job_timed_out'
            ? failure.code
            : 'wrong_failure',
        message: 'The job execution timed out.',
        retryable: true,
      }));
      const queue = makeQueue([
        delivery('timeout', 1, { kind: 'invoke', payload: {} }),
      ]);
      const run = makeJob({
        queue: queue.queue,
        timeoutMs: 25,
        classifyUnexpected,
        invoke: async (_payload, signal) => {
          invocationSignal = signal;
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return { kind: 'complete' };
        },
      })
        .runOnce(new AbortController().signal)
        .finally(() => {
          settled = true;
        });

      await vi.advanceTimersByTimeAsync(25);
      expect(invocationSignal?.aborted).toBe(true);
      expect(settled).toBe(false);
      release?.();
      await expect(run).resolves.toBe(1);
      expect(classifyUnexpected).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'durable_job_timed_out' }),
      );
      expect(queue.retry).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels an in-flight invocation without applying a durable transition', async () => {
    const controller = new AbortController();
    let invocationStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      invocationStarted = resolve;
    });
    const queue = makeQueue([
      delivery('cancelled', 1, { kind: 'invoke', payload: {} }),
    ]);
    const run = makeJob({
      queue: queue.queue,
      invoke: async (_payload, signal) => {
        invocationStarted?.();
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        });
      },
    }).runOnce(controller.signal);

    await started;
    const cancellation = unexpectedError({
      code: 'test_shutdown_requested',
      message: 'Shutdown requested.',
    });
    controller.abort(cancellation);

    await expect(run).rejects.toBe(cancellation);
    expect(queue.complete).not.toHaveBeenCalled();
    expect(queue.retry).not.toHaveBeenCalled();
    expect(queue.deadLetter).not.toHaveBeenCalled();
  });

  it('awaits a slow ignored-signal mutation before shutdown can finish the pass', async () => {
    const controller = new AbortController();
    let invocationStarted: (() => void) | undefined;
    let release: (() => void) | undefined;
    let settled = false;
    const started = new Promise<void>((resolve) => {
      invocationStarted = resolve;
    });
    const queue = makeQueue([
      delivery('slow-cancelled', 1, { kind: 'invoke', payload: {} }),
    ]);
    const run = makeJob({
      queue: queue.queue,
      invoke: async () => {
        invocationStarted?.();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { kind: 'complete' };
      },
    })
      .runOnce(controller.signal)
      .finally(() => {
        settled = true;
      });

    await started;
    const cancellation = unexpectedError({
      code: 'test_slow_shutdown_requested',
      message: 'Slow shutdown requested.',
    });
    controller.abort(cancellation);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(queue.complete).not.toHaveBeenCalled();

    release?.();
    await expect(run).rejects.toBe(cancellation);
    expect(queue.complete).not.toHaveBeenCalled();
    expect(queue.retry).not.toHaveBeenCalled();
    expect(queue.deadLetter).not.toHaveBeenCalled();
  });

  it('runs the fail-open queue afterPass hook after success and failure', async () => {
    const order: string[] = [];
    const successful = makeQueue(
      [delivery('complete', 1, { kind: 'complete-without-invoke' })],
      { afterPass: async () => void order.push('after-pass') },
    );
    successful.complete.mockImplementation(async () => {
      order.push('complete');
      return applied;
    });
    await makeJob({ queue: successful.queue }).runOnce(
      new AbortController().signal,
    );
    expect(order).toEqual(['complete', 'after-pass']);

    const failure = unexpectedError({
      code: 'test_claim_failed',
      message: 'Claim failed.',
    });
    const failed = makeQueue([], {
      afterPass: async () => {
        order.push('after-failed-pass');
        throw { fault: 'after pass unavailable' };
      },
    });
    failed.claim.mockRejectedValue(failure);
    await expect(
      makeJob({ queue: failed.queue }).runOnce(new AbortController().signal),
    ).rejects.toBe(failure);
    expect(order).toEqual(['complete', 'after-pass', 'after-failed-pass']);
  });

  it('records every busy pass, samples idle passes, and isolates observation failures', async () => {
    const records: unknown[] = [];
    const times = [
      0n,
      1_000_000_000n,
      10_000_000_000n,
      11_000_000_000n,
      61_000_000_000n,
      62_000_000_000n,
    ];
    const idleQueue = makeQueue([]);
    const idle = makeJob({
      queue: idleQueue.queue,
      nowNanoseconds: () => times.shift() ?? 62_000_000_000n,
      observer: { record: (value) => records.push(value) },
    });

    await idle.runOnce(new AbortController().signal);
    await idle.runOnce(new AbortController().signal);
    await idle.runOnce(new AbortController().signal);

    expect(records).toHaveLength(2);
    expect(records).toEqual([
      expect.objectContaining({ kind: 'queue-pass', outcome: 'idle' }),
      expect.objectContaining({ kind: 'queue-pass', outcome: 'idle' }),
    ]);

    const busyQueue = makeQueue([
      delivery('busy', 1, { kind: 'complete-without-invoke' }),
    ]);
    await expect(
      makeJob({
        queue: busyQueue.queue,
        observer: {
          record: () => {
            throw unexpectedError({
              code: 'test_observation_unavailable',
              message: 'Observation unavailable.',
            });
          },
        },
      }).runOnce(new AbortController().signal),
    ).resolves.toBe(1);
    expect(busyQueue.complete).toHaveBeenCalledOnce();
  });
});

describe('sequential loop and shutdown', () => {
  it('does not let one failed queue pass starve a later independent queue', async () => {
    const firstFailure = unexpectedError({
      code: 'test_first_queue_unavailable',
      message: 'First queue unavailable.',
    });
    const later = vi.fn(async () => 2);
    const sequential = makeSequentialDurableJob([
      { runOnce: async () => Promise.reject(firstFailure) },
      { runOnce: later },
    ]);

    await expect(sequential.runOnce(new AbortController().signal)).rejects.toBe(
      firstFailure,
    );
    expect(later).toHaveBeenCalledOnce();
  });

  it('preserves every independent queue failure in one aggregate error', async () => {
    const first = unexpectedError({
      code: 'test_first_queue_unavailable',
      message: 'First queue unavailable.',
    });
    const second = unexpectedError({
      code: 'test_second_queue_unavailable',
      message: 'Second queue unavailable.',
    });
    const sequential = makeSequentialDurableJob([
      { runOnce: async () => Promise.reject(first) },
      { runOnce: async () => Promise.reject(second) },
    ]);

    const failure = await sequential
      .runOnce(new AbortController().signal)
      .catch((value: unknown) => value);

    expect(failure).toMatchObject({
      code: 'durable_peer_jobs_failed',
      details: { failureCount: 2 },
      cause: expect.any(AggregateError),
    });
    expect((failure as Error & { cause: AggregateError }).cause.errors).toEqual(
      [first, second],
    );
  });

  it('does not sleep after a busy pass and beats process progress once', async () => {
    const controller = new AbortController();
    const sleep = vi.fn(
      async (_milliseconds: number, _signal: AbortSignal) => undefined,
    );
    const beat = vi.fn(async () => undefined);
    const job = {
      runOnce: vi.fn(async () => {
        controller.abort();
        return 2;
      }),
    };

    await runDurableJobLoop({
      job,
      pollIntervalMs: 1_000,
      retryBaseMs: 100,
      retryMaxMs: 1_000,
      signal: controller.signal,
      heartbeat: { beat },
      sleep,
    });

    expect(job.runOnce).toHaveBeenCalledOnce();
    expect(beat).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('sleeps only after an idle pass and exits through abort-aware cancellation', async () => {
    const controller = new AbortController();
    const sleep = vi.fn(async (_milliseconds: number, signal: AbortSignal) => {
      expect(signal).toBe(controller.signal);
      controller.abort();
    });
    const beat = vi.fn(async () => undefined);

    await runDurableJobLoop({
      job: { runOnce: async () => 0 },
      pollIntervalMs: 1_000,
      retryBaseMs: 100,
      retryMaxMs: 1_000,
      signal: controller.signal,
      heartbeat: { beat },
      sleep,
    });

    expect(beat).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(1_000, controller.signal);
  });

  it('uses bounded loop backoff and advances heartbeat only after recovery', async () => {
    const controller = new AbortController();
    const failure = unexpectedError({
      code: 'test_queue_unavailable',
      message: 'Queue unavailable.',
    });
    const runOnce = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(failure)
      .mockImplementationOnce(async () => {
        controller.abort();
        return 0;
      });
    const beat = vi.fn(async () => undefined);
    const sleep = vi.fn(
      async (_milliseconds: number, _signal: AbortSignal) => undefined,
    );
    const observations: unknown[] = [];

    await runDurableJobLoop({
      job: { runOnce },
      pollIntervalMs: 1_000,
      retryBaseMs: 500,
      retryMaxMs: 800,
      signal: controller.signal,
      heartbeat: { beat },
      observer: { record: (value) => observations.push(value) },
      sleep,
    });

    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([500, 800]);
    expect(beat).toHaveBeenCalledOnce();
    expect(observations).toEqual([
      {
        kind: 'loop-failure',
        consecutiveFailures: 1,
        retryDelayMs: 500,
        failure,
      },
      {
        kind: 'loop-failure',
        consecutiveFailures: 2,
        retryDelayMs: 800,
        failure,
      },
    ]);
  });

  it('aggregates shutdown failures after attempting every resource', async () => {
    const first = unexpectedError({
      code: 'test_first_close_failed',
      message: 'First close failed.',
    });
    const second = unexpectedError({
      code: 'test_second_close_failed',
      message: 'Second close failed.',
    });
    const finalShutdown = vi.fn(async () => undefined);

    const failure = await shutdownDurableJobResources([
      async () => Promise.reject(first),
      async () => Promise.reject(second),
      finalShutdown,
    ]).catch((value: unknown) => value);

    expect(finalShutdown).toHaveBeenCalledOnce();
    expect(failure).toMatchObject({
      code: 'durable_jobs_shutdown_failed',
      details: { failureCount: 2 },
      cause: expect.any(AggregateError),
    });
    expect((failure as Error & { cause: AggregateError }).cause.errors).toEqual(
      [first, second],
    );
  });
});
