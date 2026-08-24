import type { DurableJobRetryPolicy } from './delivery.ts';

export const boundedExponentialJitterDelayMs = (
  input: Readonly<{
    attempt: number;
    baseMs: number;
    maxMs: number;
    jitter: number;
  }>,
): number => {
  const exponential = Math.min(
    input.maxMs,
    input.baseMs * 2 ** Math.max(0, input.attempt - 1),
  );

  return Math.round(exponential * (0.75 + input.jitter * 0.5));
};

export type DurableJobFailureDecision =
  | Readonly<{ action: 'retry' }>
  | Readonly<{
      action: 'dead-letter';
      reason: 'attempts-exhausted' | 'permanent-failure' | 'retry-disabled';
    }>;

export const decideDurableJobFailure = (
  input: Readonly<{
    retryable: boolean;
    attempt: number;
    policy: DurableJobRetryPolicy;
  }>,
): DurableJobFailureDecision => {
  if (!input.retryable)
    return { action: 'dead-letter', reason: 'permanent-failure' };

  if (input.policy.strategy === 'none')
    return { action: 'dead-letter', reason: 'retry-disabled' };

  if (input.attempt >= input.policy.maxAttempts)
    return { action: 'dead-letter', reason: 'attempts-exhausted' };

  return { action: 'retry' };
};
