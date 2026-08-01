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
import type { AccessControlAuthPort } from './http/auth.port.ts';
import {
  makeProductionAccessControl,
  type ProductionAccessControl,
} from './production/production.guard.ts';
import {
  makeOrderManagementAccessControl,
  type OrderManagementAccessControl,
} from './order-management/order-management.guard.ts';
import type { LocationAncestryPort } from './identity/location-ancestry.port.ts';

export type AccessControlModule = Readonly<{
  pricing: PricingAccessControl;
  authSessions: AuthSessionAccessControl;
  mfa: MfaAccessControl;
  orderManagement: OrderManagementAccessControl;
  production: ProductionAccessControl;
}>;

export type AccessControlModuleDeps = Readonly<{
  auth: AccessControlAuthPort;
  locationAncestry: LocationAncestryPort;
  clock?: Readonly<{ now: () => Date }>;
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
  orderManagement: makeOrderManagementAccessControl({
    auth: input.auth,
    locationAncestry: input.locationAncestry,
  }),
  production: makeProductionAccessControl({
    auth: input.auth,
    locationAncestry: input.locationAncestry,
    ...(input.clock === undefined ? {} : { clock: input.clock }),
  }),
});
