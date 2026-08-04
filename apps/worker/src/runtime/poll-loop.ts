import type { WorkerJob } from './job.ts';

export type WorkerLoopSleep = (
  milliseconds: number,
  signal: AbortSignal,
) => Promise<void>;

const wait: WorkerLoopSleep = (milliseconds, signal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const timeout = setTimeout(resolve, milliseconds);

    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });

export const loopRetryDelayMs = (input: {
  consecutiveFailures: number;
  baseMs: number;
  maxMs: number;
}): number =>
  Math.min(
    input.maxMs,
    input.baseMs * 2 ** Math.max(0, input.consecutiveFailures - 1),
  );

export const runWorkerLoop = async (input: {
  job: WorkerJob;
  pollIntervalMs: number;
  retryBaseMs: number;
  retryMaxMs: number;
  signal: AbortSignal;
  heartbeat: Readonly<{ beat: () => Promise<void> }>;
  onError: (input: {
    error: unknown;
    consecutiveFailures: number;
    retryDelayMs: number;
  }) => void;
  sleep?: WorkerLoopSleep;
}): Promise<void> => {
  const sleep = input.sleep ?? wait;
  let consecutiveFailures = 0;

  while (!input.signal.aborted) {
    try {
      const processed = await input.job.runOnce();
      await input.heartbeat.beat();

      consecutiveFailures = 0;
      if (processed === 0 && !input.signal.aborted)
        await sleep(input.pollIntervalMs, input.signal);
    } catch (error: unknown) {
      if (input.signal.aborted) break;

      consecutiveFailures += 1;
      const retryDelayMs = loopRetryDelayMs({
        consecutiveFailures,
        baseMs: input.retryBaseMs,
        maxMs: input.retryMaxMs,
      });
      input.onError({ error, consecutiveFailures, retryDelayMs });

      await sleep(retryDelayMs, input.signal);
    }
  }
};
