import type { RequestHandler } from 'express';
import {
  makePricingAccessControl,
  type AccessControlAuthorize,
  type PricingAccessControl,
} from './guards/pricing.guards.ts';

export type AccessControlModule = Readonly<{ pricing: PricingAccessControl }>;

export const makeAccessControlModule = (input: {
  auth: Readonly<{
    authenticate: RequestHandler;
    authorize: AccessControlAuthorize;
  }>;
  policies: Readonly<{
    pricing: Readonly<{
      freshSessionMaxAgeMinutes: number;
    }>;
  }>;
}): AccessControlModule => ({
  pricing: makePricingAccessControl({
    authenticate: input.auth.authenticate,
    authorize: input.auth.authorize,
    policies: input.policies.pricing,
  }),
});
