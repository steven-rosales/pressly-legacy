export type WorkerJob = Readonly<{ runOnce: () => Promise<number> }>;

export const makeSequentialJob = (jobs: readonly WorkerJob[]): WorkerJob => ({
  runOnce: async () => {
    let processed = 0;
    for (const job of jobs) processed += await job.runOnce();
    return processed;
  },
});
