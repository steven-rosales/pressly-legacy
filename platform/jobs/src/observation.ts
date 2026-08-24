export type DurableJobPassOutcome = 'busy' | 'cancelled' | 'failed' | 'idle';

export type DurableJobObservation =
  | Readonly<{
      kind: 'queue-pass';
      jobId: string;
      queueId: string;
      outcome: DurableJobPassOutcome;
      processed?: number;
      durationSeconds?: number;
    }>
  | Readonly<{
      kind: 'delivery-transition';
      jobId: string;
      queueId: string;
      deliveryId: string;
      attempted: 'complete' | 'dead-letter' | 'retry';
      outcome: 'applied' | 'lease-lost';
      code?: string;
      delayMs?: number;
    }>
  | Readonly<{
      kind: 'loop-failure';
      consecutiveFailures: number;
      retryDelayMs: number;
      failure: unknown;
    }>;

export type DurableJobObserver = Readonly<{
  record: (observation: DurableJobObservation) => void;
}>;

export const nullDurableJobObserver: DurableJobObserver = Object.freeze({
  record: () => undefined,
});

export const attemptJobObservation = (
  observer: DurableJobObserver,
  observation: DurableJobObservation,
): void => {
  try {
    observer.record(observation);
  } catch {
    // Observation is explicitly non-authoritative.
  }
};
