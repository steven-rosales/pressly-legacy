import {
  makePricingAccessControl,
  type PricingAccessControl,
} from './pricing/pricing.guard.ts';
import {
  makeAuthSessionAccessControl,
  type AuthSessionAccessControl,
} from './auth-sessions/auth-sessions.guard.ts';
import {
  makeMfaAccessControl,
  type MfaAccessControl,
} from './mfa/mfa.guard.ts';
import type { AccessControlAuthPort } from './auth.port.ts';

export type AccessControlModule = Readonly<{
  pricing: PricingAccessControl;
  authSessions: AuthSessionAccessControl;
  mfa: MfaAccessControl;
}>;

export type AccessControlModuleDeps = Readonly<{
  auth: AccessControlAuthPort;
  policies: Readonly<{
    pricing: Readonly<{
      freshSessionMaxAgeMinutes: number;
    }>;
    authSessions: Readonly<{
      freshSessionMaxAgeMinutes: number;
    }>;
    mfa: Readonly<{
      freshSessionMaxAgeMinutes: number;
    }>;
  }>;
}>;

export const makeAccessControlModule = (
  input: AccessControlModuleDeps,
): AccessControlModule => ({
  pricing: makePricingAccessControl({
    auth: input.auth,
    policies: input.policies.pricing,
  }),
  authSessions: makeAuthSessionAccessControl({
    auth: input.auth,
    freshSessionMaxAgeMinutes:
      input.policies.authSessions.freshSessionMaxAgeMinutes,
  }),
  mfa: makeMfaAccessControl({
    auth: input.auth,
    freshSessionMaxAgeMinutes: input.policies.mfa.freshSessionMaxAgeMinutes,
  }),
});
