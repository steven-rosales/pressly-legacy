export type { Identity, IdentityKind } from './identity.ts';
export { normalizeEmail } from './identity.ts';

export type { CustomerAudience, Principal } from './principal.ts';
export { customerAudience, principalLabel } from './principal.ts';

export type { Session } from './session.ts';
export {
  isSessionExpired,
  isSessionIdleExpired,
  isSessionRevoked,
  sessionAgeMinutes,
} from './session.ts';

export type { MfaFailure } from '../language/mfa/mfa.failure.ts';
