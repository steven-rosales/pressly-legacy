import type { Principal } from '@pressly/auth/authentication';
import type { PrincipalAttributes } from '@pressly/auth/authorization';
import type { Clock } from '@pressly/time';
import { makeOrderManagementPolicies } from '../features/commercial/authorize-order-management/order-management-authorization.policy.ts';
import {
  orderManagementLocationResource,
  orderManagementUsersResource,
} from '../features/commercial/authorize-order-management/order-management-resource.value.ts';
import { makePricingPolicies } from '../features/commercial/authorize-pricing/pricing-authorization.policy.ts';
import { pricingCatalogResource } from '../features/commercial/authorize-pricing/pricing-resource.value.ts';
import { makeAuthSessionPolicies } from '../features/identity/authorize-auth-sessions/auth-session-authorization.policy.ts';
import { makeMfaPolicies } from '../features/identity/authorize-mfa/mfa-authorization.policy.ts';
import {
  makeProductionPolicies,
  productionCapabilitiesForLocation,
} from '../features/operations/authorize-production/production-authorization.policy.ts';
import {
  productionLocationResource,
  productionOperationsResource,
} from '../features/operations/authorize-production/production-resource.value.ts';
import {
  makeResolveLocationAncestry,
  type ResolveLocationAncestry,
} from '../features/scopes/resolve-location-ancestry/resolve-location-ancestry.usecase.ts';
import {
  makeResolveProductionVisibility,
  type ResolveProductionVisibility,
} from '../features/scopes/resolve-production-visibility/resolve-production-visibility.usecase.ts';
import { authIdentityResource } from '../foundations/language/identity-resource/auth-identity.value.ts';
import type { LocationAncestryPort } from '../foundations/ports/location-ancestry/location-ancestry.port.ts';

export type AuthorizationModuleDeps = Readonly<{
  locationAncestry: LocationAncestryPort;
  clock: Clock;
  policies: Readonly<{
    pricing: Readonly<{ freshSessionMaxAgeMinutes: number }>;
    authSessions: Readonly<{ freshSessionMaxAgeMinutes: number }>;
    mfa: Readonly<{ freshSessionMaxAgeMinutes: number }>;
  }>;
}>;

export type AuthorizationModule = Readonly<{
  policies: Readonly<{
    pricing: ReturnType<typeof makePricingPolicies>;
    authSessions: ReturnType<typeof makeAuthSessionPolicies>;
    mfa: ReturnType<typeof makeMfaPolicies>;
    orderManagement: ReturnType<typeof makeOrderManagementPolicies>;
    production: ReturnType<typeof makeProductionPolicies>;
  }>;
  resources: Readonly<{
    authIdentity: typeof authIdentityResource;
    pricingCatalog: typeof pricingCatalogResource;
    orderManagementUsers: typeof orderManagementUsersResource;
    orderManagementLocation: typeof orderManagementLocationResource;
    productionLocation: typeof productionLocationResource;
    productionOperations: typeof productionOperationsResource;
  }>;
  resolveLocationAncestry: ResolveLocationAncestry;
  resolveProductionVisibility: ResolveProductionVisibility;
  productionCapabilitiesForLocation: (input: {
    principal: Principal;
    principalAttributes: PrincipalAttributes;
    locationId: string;
    businessId: string;
    now: Date;
  }) => ReturnType<typeof productionCapabilitiesForLocation>;
}>;

export const makeAuthorizationModule = (
  deps: AuthorizationModuleDeps,
): AuthorizationModule =>
  Object.freeze({
    policies: Object.freeze({
      pricing: makePricingPolicies(deps.policies.pricing),
      authSessions: makeAuthSessionPolicies(deps.policies.authSessions),
      mfa: makeMfaPolicies(deps.policies.mfa),
      orderManagement: makeOrderManagementPolicies(),
      production: makeProductionPolicies(),
    }),
    resources: Object.freeze({
      authIdentity: authIdentityResource,
      pricingCatalog: pricingCatalogResource,
      orderManagementUsers: orderManagementUsersResource,
      orderManagementLocation: orderManagementLocationResource,
      productionLocation: productionLocationResource,
      productionOperations: productionOperationsResource,
    }),
    resolveLocationAncestry: makeResolveLocationAncestry(deps.locationAncestry),
    resolveProductionVisibility: makeResolveProductionVisibility({
      ancestry: deps.locationAncestry,
      clock: deps.clock,
    }),
    productionCapabilitiesForLocation,
  });
