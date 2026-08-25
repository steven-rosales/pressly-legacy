import { configError } from '@pressly/errors/factories';
import type { JobExecutionPlatform, JobHostRegistration } from './jobs-host.js';
import {
  makeDurableQueueJob,
  makeSequentialDurableJob,
  runDurableJobLoop,
  shutdownDurableJobResources,
  type DurableJobLoopSleep,
  type DurableJobObserver,
  type DurableJobQueue,
  type DurableJobShutdown,
  type ProcessProgressHeartbeat,
  type RunnableDurableJob,
  type UnexpectedJobFailureDisposition,
} from '@pressly/jobs';

export type DurableJobRuntimeBinding = Readonly<{
  expected: Readonly<{
    jobId: string;
    queue: string;
    maxAttempts: number;
  }>;
  queue: DurableJobQueue;
  observeRegistration?: (
    registration: JobHostRegistration,
  ) => JobHostRegistration;
}>;

const assertRegistration = (
  registration: JobHostRegistration,
  queue: DurableJobQueue,
  expected: Readonly<{
    jobId: string;
    queue: string;
    maxAttempts: number;
    runtimeMaxAttempts: number;
  }>,
): void => {
  if (
    registration.jobId !== expected.jobId ||
    registration.trigger !== 'message' ||
    registration.queue !== expected.queue ||
    queue.id !== expected.queue
  )
    throw configError({
      code: 'worker_job_registration_invalid',
      message: `The generated Worker job registration does not match ${expected.jobId} on ${expected.queue}.`,
    });
  if (
    registration.retry === null ||
    registration.retry.maxAttempts !== expected.maxAttempts
  )
    throw configError({
      code: 'worker_job_retry_manifest_invalid',
      message: `The generated Worker job must declare ${expected.maxAttempts} attempts.`,
    });
  if (expected.runtimeMaxAttempts !== registration.retry.maxAttempts)
    throw configError({
      code: 'worker_job_max_attempts_mismatch',
      message: `WORKER_MAX_ATTEMPTS=${expected.runtimeMaxAttempts} disagrees with the generated job manifest value ${registration.retry.maxAttempts}.`,
    });
};

export const makeDurableJobExecution = (input: {
  bindings: readonly DurableJobRuntimeBinding[];
  runtimeMaxAttempts: number;
  pollIntervalMs: number;
  loopRetryBaseMs: number;
  loopRetryMaxMs: number;
  deliveryRetryBaseMs: number;
  deliveryRetryMaxMs: number;
  heartbeat: ProcessProgressHeartbeat;
  now: () => Date;
  nowNanoseconds?: () => bigint;
  random: () => number;
  observer: DurableJobObserver;
  classifyUnexpected: UnexpectedJobFailureDisposition;
  sleep?: DurableJobLoopSleep;
  shutdowns: readonly DurableJobShutdown[];
}): JobExecutionPlatform =>
  Object.freeze({
    run: async ({ jobs, signal }) => {
      if (jobs.length !== input.bindings.length)
        throw configError({
          code: 'worker_job_catalog_invalid',
          message: `The Worker requires exactly ${input.bindings.length} generated jobs; received ${jobs.length}.`,
        });

      const registrationById = new Map(
        jobs.map((registration) => [registration.jobId, registration]),
      );
      if (registrationById.size !== jobs.length)
        throw configError({
          code: 'worker_job_catalog_invalid',
          message: 'The generated Worker job catalog contains duplicate jobs.',
        });
      const pairs = input.bindings.map((binding) => {
        const registration = registrationById.get(binding.expected.jobId);
        if (registration === undefined)
          throw configError({
            code: 'worker_job_catalog_invalid',
            message: `The generated Worker job catalog is missing ${binding.expected.jobId}.`,
          });
        return Object.freeze({ binding, registration });
      });

      for (const { binding, registration } of pairs)
        assertRegistration(registration, binding.queue, {
          ...binding.expected,
          runtimeMaxAttempts: input.runtimeMaxAttempts,
        });

      const runnableJobs: readonly RunnableDurableJob[] = pairs.map(
        ({ binding, registration }) => {
          return makeDurableQueueJob({
            job: binding.observeRegistration?.(registration) ?? registration,
            queue: binding.queue,
            classifyUnexpected: input.classifyUnexpected,
            retryBaseMs: input.deliveryRetryBaseMs,
            retryMaxMs: input.deliveryRetryMaxMs,
            now: input.now,
            ...(input.nowNanoseconds === undefined
              ? {}
              : { nowNanoseconds: input.nowNanoseconds }),
            random: input.random,
            observer: input.observer,
          });
        },
      );

      await runDurableJobLoop({
        job: makeSequentialDurableJob(runnableJobs),
        pollIntervalMs: input.pollIntervalMs,
        retryBaseMs: input.loopRetryBaseMs,
        retryMaxMs: input.loopRetryMaxMs,
        signal,
        heartbeat: input.heartbeat,
        observer: input.observer,
        ...(input.sleep === undefined ? {} : { sleep: input.sleep }),
      });
    },
    shutdown: () => shutdownDurableJobResources(input.shutdowns),
  });
