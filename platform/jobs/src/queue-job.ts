import { unexpectedError } from '@pressly/errors/factories';
import type {
  ClaimedDurableJobDelivery,
  DurableJobFailure,
  DurableJobQueue,
  DurableJobRetryPolicy,
  InvokableJobRegistration,
  JobInvocationOutcome,
  UnexpectedJobFailureDisposition,
} from './delivery.ts';
import {
  attemptJobObservation,
  nullDurableJobObserver,
  type DurableJobObserver,
  type DurableJobPassOutcome,
} from './observation.ts';
import {
  boundedExponentialJitterDelayMs,
  decideDurableJobFailure,
} from './retry.ts';

export type RunnableDurableJob = Readonly<{
  runOnce: (signal: AbortSignal) => Promise<number>;
}>;

type Timer = ReturnType<typeof setTimeout>;

const observedNanoseconds = (
  nowNanoseconds: () => bigint,
): bigint | undefined => {
  try {
    return nowNanoseconds();
  } catch {
    return undefined;
  }
};

const cancellationReason = (signal: AbortSignal): unknown =>
  signal.reason ??
  unexpectedError({
    code: 'durable_job_cancelled',
    message: 'The durable job invocation was cancelled.',
  });

const invokeWithCancellation = async (
  input: Readonly<{
    job: InvokableJobRegistration;
    payload: unknown;
    signal: AbortSignal;
  }>,
): Promise<JobInvocationOutcome> => {
  if (input.signal.aborted) throw cancellationReason(input.signal);

  const controller = new AbortController();
  const abortFromParent = (): void =>
    controller.abort(cancellationReason(input.signal));
  input.signal.addEventListener('abort', abortFromParent, { once: true });

  let timer: Timer | undefined;
  if (input.job.timeoutMs !== null)
    timer = setTimeout(() => {
      controller.abort(
        unexpectedError({
          code: 'durable_job_timed_out',
          message: `Job "${input.job.jobId}" exceeded its ${input.job.timeoutMs}ms execution timeout.`,
          safeMessage: 'The job execution timed out.',
          details: {
            jobId: input.job.jobId,
            timeoutMs: input.job.timeoutMs,
          },
        }),
      );
    }, input.job.timeoutMs);

  try {
    const outcome = await input.job.invoke(input.payload, controller.signal);
    if (controller.signal.aborted) throw cancellationReason(controller.signal);
    return outcome;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    input.signal.removeEventListener('abort', abortFromParent);
  }
};

const observeTransition = (
  input: Readonly<{
    observer: DurableJobObserver;
    jobId: string;
    queueId: string;
    delivery: ClaimedDurableJobDelivery;
    attempted: 'complete' | 'dead-letter' | 'retry';
    outcome: 'applied' | 'lease-lost';
    code?: string;
    delayMs?: number;
  }>,
): void =>
  attemptJobObservation(input.observer, {
    kind: 'delivery-transition',
    jobId: input.jobId,
    queueId: input.queueId,
    deliveryId: input.delivery.id,
    attempted: input.attempted,
    outcome: input.outcome,
    ...(input.code === undefined ? {} : { code: input.code }),
    ...(input.delayMs === undefined ? {} : { delayMs: input.delayMs }),
  });

const completeDelivery = async (
  input: Readonly<{
    observer: DurableJobObserver;
    jobId: string;
    queue: DurableJobQueue;
    delivery: ClaimedDurableJobDelivery;
  }>,
): Promise<void> => {
  const outcome = await input.queue.complete(input.delivery);
  observeTransition({
    observer: input.observer,
    jobId: input.jobId,
    queueId: input.queue.id,
    delivery: input.delivery,
    attempted: 'complete',
    outcome: outcome.kind,
  });
};

const rejectDelivery = async (
  input: Readonly<{
    observer: DurableJobObserver;
    jobId: string;
    queue: DurableJobQueue;
    delivery: ClaimedDurableJobDelivery;
    failure: DurableJobFailure;
    retry: DurableJobRetryPolicy;
    retryBaseMs: number;
    retryMaxMs: number;
    now: () => Date;
    random: () => number;
  }>,
): Promise<void> => {
  const decision = decideDurableJobFailure({
    retryable: input.failure.retryable,
    attempt: input.delivery.attempt,
    policy: input.retry,
  });

  if (decision.action === 'dead-letter') {
    const outcome = await input.queue.deadLetter({
      delivery: input.delivery,
      failure: input.failure,
      retention: input.retry.deadLetter,
    });
    observeTransition({
      observer: input.observer,
      jobId: input.jobId,
      queueId: input.queue.id,
      delivery: input.delivery,
      attempted: 'dead-letter',
      outcome: outcome.kind,
      code: input.failure.code,
    });
    return;
  }

  const delayMs = boundedExponentialJitterDelayMs({
    attempt: input.delivery.attempt,
    baseMs: input.retryBaseMs,
    maxMs: input.retryMaxMs,
    jitter: input.random(),
  });
  const outcome = await input.queue.retry({
    delivery: input.delivery,
    availableAt: new Date(input.now().getTime() + delayMs),
    delayMs,
    failure: input.failure,
  });
  observeTransition({
    observer: input.observer,
    jobId: input.jobId,
    queueId: input.queue.id,
    delivery: input.delivery,
    attempted: 'retry',
    outcome: outcome.kind,
    code: input.failure.code,
    delayMs,
  });
};

const resolveDelivery = async (
  input: Readonly<{
    observer: DurableJobObserver;
    job: InvokableJobRegistration;
    retry: DurableJobRetryPolicy;
    queue: DurableJobQueue;
    delivery: ClaimedDurableJobDelivery;
    signal: AbortSignal;
    classifyUnexpected: UnexpectedJobFailureDisposition;
    retryBaseMs: number;
    retryMaxMs: number;
    now: () => Date;
    random: () => number;
  }>,
): Promise<void> => {
  const resolution = input.delivery.resolution;
  if (resolution.kind === 'complete-without-invoke') {
    await completeDelivery({ ...input, jobId: input.job.jobId });
    return;
  }

  if (resolution.kind === 'reject') {
    await rejectDelivery({
      ...input,
      jobId: input.job.jobId,
      failure: resolution.failure,
    });
    return;
  }

  let outcome: JobInvocationOutcome;
  try {
    outcome = await invokeWithCancellation({
      job: input.job,
      payload: resolution.payload,
      signal: input.signal,
    });
  } catch (failure: unknown) {
    if (input.signal.aborted) throw failure;
    outcome = {
      kind: 'reject',
      failure: input.classifyUnexpected(failure),
    };
  }

  if (outcome.kind === 'complete') {
    await completeDelivery({ ...input, jobId: input.job.jobId });
    return;
  }

  await rejectDelivery({
    ...input,
    jobId: input.job.jobId,
    failure: outcome.failure,
  });
};

export const makeDurableQueueJob = (
  input: Readonly<{
    job: InvokableJobRegistration;
    queue: DurableJobQueue;
    classifyUnexpected: UnexpectedJobFailureDisposition;
    retryBaseMs: number;
    retryMaxMs: number;
    now: () => Date;
    nowNanoseconds?: () => bigint;
    random: () => number;
    observer?: DurableJobObserver;
    idleSampleIntervalNanoseconds?: bigint;
  }>,
): RunnableDurableJob => {
  const retry = input.job.retry;
  if (retry === null)
    throw unexpectedError({
      code: 'durable_job_retry_policy_missing',
      message: `Durable job "${input.job.jobId}" has no retry policy.`,
      safeMessage: 'The durable job configuration is invalid.',
      details: { jobId: input.job.jobId },
    });

  const observer = input.observer ?? nullDurableJobObserver;
  const nowNanoseconds = input.nowNanoseconds ?? process.hrtime.bigint;
  const idleSampleIntervalNanoseconds =
    input.idleSampleIntervalNanoseconds ?? 60_000_000_000n;
  let lastIdleObservationAt: bigint | undefined;

  const finishPass = (
    outcome: DurableJobPassOutcome,
    startedAt: bigint | undefined,
    processed?: number,
  ): void => {
    const finishedAt = observedNanoseconds(nowNanoseconds);
    const shouldRecord =
      outcome !== 'idle' ||
      (finishedAt !== undefined &&
        (lastIdleObservationAt === undefined ||
          finishedAt - lastIdleObservationAt >= idleSampleIntervalNanoseconds));

    if (!shouldRecord) return;
    if (outcome === 'idle' && finishedAt !== undefined)
      lastIdleObservationAt = finishedAt;

    attemptJobObservation(observer, {
      kind: 'queue-pass',
      jobId: input.job.jobId,
      queueId: input.queue.id,
      outcome,
      ...(processed === undefined ? {} : { processed }),
      ...(startedAt === undefined || finishedAt === undefined
        ? {}
        : {
            durationSeconds: Math.max(
              0,
              Number(finishedAt - startedAt) / 1_000_000_000,
            ),
          }),
    });
  };

  return Object.freeze({
    runOnce: async (signal): Promise<number> => {
      const startedAt = observedNanoseconds(nowNanoseconds);
      let outcome: DurableJobPassOutcome = 'failed';
      let processed: number | undefined;
      try {
        const claimed = await input.queue.claim({ signal });
        for (const delivery of claimed) {
          if (signal.aborted) throw cancellationReason(signal);
          await resolveDelivery({
            ...input,
            retry,
            observer,
            delivery,
            signal,
          });
        }

        processed = claimed.length;
        outcome = claimed.length === 0 ? 'idle' : 'busy';
        return claimed.length;
      } catch (failure: unknown) {
        outcome = signal.aborted ? 'cancelled' : 'failed';
        throw failure;
      } finally {
        try {
          await input.queue.afterPass?.();
        } catch {
          // Queue-owned after-pass observation is explicitly fail-open.
        }
        finishPass(outcome, startedAt, processed);
      }
    },
  });
};
