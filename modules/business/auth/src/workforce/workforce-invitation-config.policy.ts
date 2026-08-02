import { configError } from '@pressly/errors';

export const requireWorkforceInvitationTtlMinutes = (value: number): number => {
  if (Number.isSafeInteger(value) && value > 0) return value;

  throw configError({
    code: 'workforce_invitation_ttl_invalid',
    message: 'Workforce invitation TTL must be a positive integer.',
    safeMessage: 'Authentication service configuration is invalid.',
  });
};
