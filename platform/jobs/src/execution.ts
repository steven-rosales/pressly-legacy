import type {
  DurableJobQueue,
  InvokableJobRegistration,
  UnexpectedJobFailureDisposition,
} from './delivery.ts';
import type { DurableJobObserver } from './observation.ts';
import {
  runDurableJobLoop,
  type DurableJobLoopSleep,
  type ProcessProgressHeartbeat,
} from './poll-loop.ts';
import { makeDurableQueueJob } from './queue-job.ts';
import { makeSequentialDurableJob } from './sequential.ts';
import {
  shutdownDurableJobResources,
  type DurableJobShutdown,
} from './shutdown.ts';

export type DurableJobsExecution = Readonly<{
  run: (
    input: Readonly<{
      jobs: readonly InvokableJobRegistration[];
      signal: AbortSignal;
    }>,
  ) => Promise<void>;
  shutdown: () => Promise<void>;
}>;

export const makeDurableJobsExecution = (
  input: Readonly<{
    bindQueue: (registration: InvokableJobRegistration) => DurableJobQueue;
    classifyUnexpected: UnexpectedJobFailureDisposition;
    pollIntervalMs: number;
    loopRetryBaseMs: number;
    loopRetryMaxMs: number;
    deliveryRetryBaseMs: number;
    deliveryRetryMaxMs: number;
    heartbeat: ProcessProgressHeartbeat;
    now: () => Date;
    nowNanoseconds?: () => bigint;
    random: () => number;
    observer?: DurableJobObserver;
    sleep?: DurableJobLoopSleep;
    shutdowns?: readonly DurableJobShutdown[];
  }>,
): DurableJobsExecution =>
  Object.freeze({
    run: async ({ jobs, signal }): Promise<void> => {
      const queueJobs = jobs.map((job) => {
        return makeDurableQueueJob({
          job,
          queue: input.bindQueue(job),
          classifyUnexpected: input.classifyUnexpected,
          retryBaseMs: input.deliveryRetryBaseMs,
          retryMaxMs: input.deliveryRetryMaxMs,
          now: input.now,
          ...(input.nowNanoseconds === undefined
            ? {}
            : { nowNanoseconds: input.nowNanoseconds }),
          random: input.random,
          ...(input.observer === undefined ? {} : { observer: input.observer }),
        });
      });

      await runDurableJobLoop({
        job: makeSequentialDurableJob(queueJobs),
        pollIntervalMs: input.pollIntervalMs,
        retryBaseMs: input.loopRetryBaseMs,
        retryMaxMs: input.loopRetryMaxMs,
        signal,
        heartbeat: input.heartbeat,
        ...(input.observer === undefined ? {} : { observer: input.observer }),
        ...(input.sleep === undefined ? {} : { sleep: input.sleep }),
      });
    },
    shutdown: () => shutdownDurableJobResources(input.shutdowns ?? []),
  });
