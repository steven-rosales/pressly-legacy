import type { AuthResource } from '../resource.ts';
import type { PolicyCondition } from '../policy.ts';

export const sameIdentity = <
  R extends AuthResource & Readonly<{ id: string }>,
>(): PolicyCondition<R> => ({
  name: 'same_identity',
  denyReason: 'missing_assignment',
  safeMessage: 'You do not have permission to perform this action.',
  evaluate: ({ principal, resource }) => principal.identityId === resource.id,
});
