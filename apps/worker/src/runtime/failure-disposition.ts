import type { AppError } from '@pressly/errors/app-error';

const transientKinds = new Set<AppError['kind']>([
  'RateLimitError',
  'ExternalServiceError',
  'DatabaseError',
  'UnexpectedError',
]);

const transientStatuses = new Set<number>([408, 429, 502, 503, 504]);

/**
 * Pure worker policy. Domain handlers describe the failure; this function
 * decides whether repeating an effect can plausibly make progress.
 */
export const isRetryableAppError = (error: AppError): boolean =>
  transientKinds.has(error.kind) || transientStatuses.has(error.status);

export type FailureDisposition =
  | Readonly<{ action: 'retry'; reason: 'transient_failure' }>
  | Readonly<{
      action: 'dead_letter';
      reason: 'permanent_failure' | 'attempts_exhausted';
    }>;

export const decideFailureDisposition = (input: {
  retryable: boolean;
  attempt: number;
  maxAttempts: number;
}): FailureDisposition => {
  if (!input.retryable)
    return { action: 'dead_letter', reason: 'permanent_failure' };

  if (input.attempt >= input.maxAttempts)
    return { action: 'dead_letter', reason: 'attempts_exhausted' };

  return { action: 'retry', reason: 'transient_failure' };
};
