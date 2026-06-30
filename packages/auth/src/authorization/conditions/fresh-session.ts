import type { AuthResource } from '../resource.ts';
import type { PolicyCondition } from '../policy.ts';

export const freshSession = <R extends AuthResource>(
  maxAgeMinutes: number,
): PolicyCondition<R> => ({
  name: 'fresh_session',
  denyReason: 'stale_session',
  safeMessage: 'Please login again before performing this action.',
  evaluate: ({ environment }) =>
    typeof environment.sessionAgeMinutes === 'number' &&
    environment.sessionAgeMinutes <= maxAgeMinutes,
});
