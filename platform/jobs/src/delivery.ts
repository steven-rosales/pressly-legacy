export type DurableJobFailure = Readonly<{
  code: string;
  message: string;
  retryable: boolean;
  category?:
    | 'conflict'
    | 'external_service'
    | 'invariant'
    | 'not_found'
    | 'validation';
  status?: number;
}>;

export type JobInvocationOutcome =
  | Readonly<{ kind: 'complete' }>
  | Readonly<{ kind: 'reject'; failure: DurableJobFailure }>;

export type ClaimedDeliveryResolution =
  | Readonly<{ kind: 'invoke'; payload: unknown }>
  | Readonly<{ kind: 'complete-without-invoke' }>
  | Readonly<{ kind: 'reject'; failure: DurableJobFailure }>;

export type ClaimedDurableJobDelivery = Readonly<{
  id: string;
  attempt: number;
  /** Queue-owned lease or fencing data. The generic mechanism never reads it. */
  receipt: unknown;
  resolution: ClaimedDeliveryResolution;
}>;

export type DurableJobTransitionOutcome =
  | Readonly<{ kind: 'applied' }>
  | Readonly<{ kind: 'lease-lost' }>;

export type DurableJobRetryPolicy = Readonly<{
  maxAttempts: number;
  strategy: 'bounded-exponential-jitter' | 'none';
  deadLetter: 'discard' | 'retain';
}>;

export type InvokableJobRegistration = Readonly<{
  jobId: string;
  timeoutMs: number | null;
  retry: DurableJobRetryPolicy | null;
  invoke: (
    payload: unknown,
    signal: AbortSignal,
  ) => Promise<JobInvocationOutcome>;
}>;

export type DurableJobQueue = Readonly<{
  id: string;
  claim: (
    input: Readonly<{ signal: AbortSignal }>,
  ) => Promise<readonly ClaimedDurableJobDelivery[]>;
  complete: (
    delivery: ClaimedDurableJobDelivery,
  ) => Promise<DurableJobTransitionOutcome>;
  retry: (
    input: Readonly<{
      delivery: ClaimedDurableJobDelivery;
      availableAt: Date;
      delayMs: number;
      failure: DurableJobFailure;
    }>,
  ) => Promise<DurableJobTransitionOutcome>;
  deadLetter: (
    input: Readonly<{
      delivery: ClaimedDurableJobDelivery;
      failure: DurableJobFailure;
      retention: DurableJobRetryPolicy['deadLetter'];
    }>,
  ) => Promise<DurableJobTransitionOutcome>;
  /** Queue-owned fail-open work that runs after the complete delivery pass. */
  afterPass?: () => Promise<void>;
}>;

export type UnexpectedJobFailureDisposition = (
  failure: unknown,
) => DurableJobFailure;
