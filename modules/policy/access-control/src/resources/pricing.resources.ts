import {
  globalScope,
  locationScope,
  type AuthResource,
  type Scope,
} from '@pressly/auth/authorization';
import type { PricingChangeRequest } from '@pressly/contracts';

export type PricingCatalogResource = Omit<AuthResource, 'kind' | 'attributes'> &
  Readonly<{
    kind: 'pricing.catalog';
    attributes: Readonly<{ serviceSlug: string; locationSlug?: string }>;
  }>;

const pricingScopeFromRequest = (request: PricingChangeRequest): Scope =>
  request.locationSlug === undefined
    ? globalScope()
    : locationScope(request.locationSlug);

export const pricingCatalogResourceFromRequest = (
  request: PricingChangeRequest,
): PricingCatalogResource => ({
  kind: 'pricing.catalog',
  scope: pricingScopeFromRequest(request),
  id:
    request.locationSlug === undefined
      ? `pricing:${request.serviceSlug}:global`
      : `pricing:${request.serviceSlug}:location:${request.locationSlug}`,
  attributes: {
    serviceSlug: request.serviceSlug,
    ...(request.locationSlug === undefined
      ? {}
      : { locationSlug: request.locationSlug }),
  },
});
