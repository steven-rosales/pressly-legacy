import type { RequestHandler } from 'express';
import {
  makePricingAccessControl,
  type AccessControlAuthorize,
  type PricingAccessControl,
} from './guards/pricing.guards.ts';
import {
  makeAuthSessionAccessControl,
  type AuthSessionAccessControl,
} from './guards/auth-sessions.guards.ts';
import {
  makeMfaAccessControl,
  type MfaAccessControl,
} from './guards/mfa.guards.ts';

export type AccessControlModule = Readonly<{
  pricing: PricingAccessControl;
  authSessions: AuthSessionAccessControl;
  mfa: MfaAccessControl;
}>;

export const makeAccessControlModule = (input: {
  auth: Readonly<{
    authenticate: RequestHandler;
    authorize: AccessControlAuthorize;
  }>;
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
}): AccessControlModule => ({
  pricing: makePricingAccessControl({
    authenticate: input.auth.authenticate,
    authorize: input.auth.authorize,
    policies: input.policies.pricing,
  }),
  authSessions: makeAuthSessionAccessControl({
    authenticate: input.auth.authenticate,
    authorize: input.auth.authorize,
    freshSessionMaxAgeMinutes:
      input.policies.authSessions.freshSessionMaxAgeMinutes,
  }),
  mfa: makeMfaAccessControl({
    authenticate: input.auth.authenticate,
    authorize: input.auth.authorize,
    freshSessionMaxAgeMinutes: input.policies.mfa.freshSessionMaxAgeMinutes,
  }),
});
