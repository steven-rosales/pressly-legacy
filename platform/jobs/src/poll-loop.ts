import {
  attemptJobObservation,
  nullDurableJobObserver,
  type DurableJobObserver,
} from './observation.ts';
import type { RunnableDurableJob } from './queue-job.ts';

export type DurableJobLoopSleep = (
  milliseconds: number,
  signal: AbortSignal,
) => Promise<void>;

export type ProcessProgressHeartbeat = Readonly<{
  /** Records a successful composite pass; it never renews a delivery lease. */
  beat: () => Promise<void>;
}>;

const wait: DurableJobLoopSleep = (milliseconds, signal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

export const durableJobLoopRetryDelayMs = (
  input: Readonly<{
    consecutiveFailures: number;
    baseMs: number;
    maxMs: number;
  }>,
): number =>
  Math.min(
    input.maxMs,
    input.baseMs * 2 ** Math.max(0, input.consecutiveFailures - 1),
  );

export const runDurableJobLoop = async (
  input: Readonly<{
    job: RunnableDurableJob;
    pollIntervalMs: number;
    retryBaseMs: number;
    retryMaxMs: number;
    signal: AbortSignal;
    heartbeat: ProcessProgressHeartbeat;
    observer?: DurableJobObserver;
    sleep?: DurableJobLoopSleep;
  }>,
): Promise<void> => {
  const observer = input.observer ?? nullDurableJobObserver;
  const sleep = input.sleep ?? wait;
  let consecutiveFailures = 0;

  while (!input.signal.aborted) {
    try {
      const processed = await input.job.runOnce(input.signal);
      await input.heartbeat.beat();

      consecutiveFailures = 0;
      if (processed === 0 && !input.signal.aborted)
        await sleep(input.pollIntervalMs, input.signal);
    } catch (failure: unknown) {
      if (input.signal.aborted) break;

      consecutiveFailures += 1;
      const retryDelayMs = durableJobLoopRetryDelayMs({
        consecutiveFailures,
        baseMs: input.retryBaseMs,
        maxMs: input.retryMaxMs,
      });
      attemptJobObservation(observer, {
        kind: 'loop-failure',
        consecutiveFailures,
        retryDelayMs,
        failure,
      });
      await sleep(retryDelayMs, input.signal);
    }
  }
};
