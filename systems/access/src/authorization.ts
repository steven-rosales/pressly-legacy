import type { Principal } from './model/authentication/public.ts';
import type { PrincipalAttributes } from './model/authorization/public.ts';
import type { Clock } from '@pressly/time';
import { makeResolveLocationAncestry } from './cells/scopes/resolve-location-ancestry/resolve-location-ancestry.usecase.ts';
import { makeResolveProductionVisibility } from './cells/scopes/resolve-production-visibility/resolve-production-visibility.usecase.ts';
import { makeOrderManagementPolicies } from './model/authorization/commercial/authorize-order-management/order-management-authorization.policy.ts';
import { orderManagementLocationResource } from './model/authorization/commercial/authorize-order-management/order-management-resource.value.ts';
import { makePricingPolicies } from './model/authorization/commercial/authorize-pricing/pricing-authorization.policy.ts';
import { pricingCatalogResource } from './model/authorization/commercial/authorize-pricing/pricing-resource.value.ts';
import { makeAuthSessionPolicies } from './model/authorization/identity/authorize-auth-sessions/auth-session-authorization.policy.ts';
import { makeMfaPolicies } from './model/authorization/identity/authorize-mfa/mfa-authorization.policy.ts';
import {
  makeProductionPolicies,
  productionCapabilitiesForLocation,
} from './model/authorization/operations/authorize-production/production-authorization.policy.ts';
import {
  productionLocationResource,
  productionOperationsResource,
} from './model/authorization/operations/authorize-production/production-resource.value.ts';
import { authIdentityResource } from './model/authorization/language/identity-resource/auth-identity.value.ts';
import type { LocationAncestryPort } from './model/ports/location-ancestry/location-ancestry.port.ts';

export type AccessAuthorizationDependencies = Readonly<{
  locationAncestry: LocationAncestryPort;
  clock: Clock;
  policies: Readonly<{
    pricing: Readonly<{ freshSessionMaxAgeMinutes: number }>;
    authSessions: Readonly<{ freshSessionMaxAgeMinutes: number }>;
    mfa: Readonly<{ freshSessionMaxAgeMinutes: number }>;
  }>;
}>;

export const makeAccessAuthorization = (
  deps: AccessAuthorizationDependencies,
) =>
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
      orderManagementLocation: orderManagementLocationResource,
      productionLocation: productionLocationResource,
      productionOperations: productionOperationsResource,
    }),
    resolveLocationAncestry: makeResolveLocationAncestry(deps.locationAncestry),
    resolveProductionVisibility: makeResolveProductionVisibility({
      ancestry: deps.locationAncestry,
      clock: deps.clock,
    }),
    productionCapabilitiesForLocation: (input: {
      principal: Principal;
      principalAttributes: PrincipalAttributes;
      locationId: string;
      businessId: string;
      now: Date;
    }) => productionCapabilitiesForLocation(input),
  });

export type AccessAuthorization = ReturnType<typeof makeAccessAuthorization>;
