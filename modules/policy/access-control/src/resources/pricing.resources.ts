import { globalScope, type AuthResource } from '@pressly/auth/authorization';
import type { PricingChangeRequest } from '@pressly/contracts';

export type PricingCatalogResource = Omit<AuthResource, 'kind' | 'attributes'> &
  Readonly<{
    kind: 'pricing.catalog';
    attributes: Readonly<{ serviceSlug: string }>;
  }>;

export const pricingCatalogResourceFromRequest = (
  request: PricingChangeRequest,
): PricingCatalogResource => ({
  kind: 'pricing.catalog',
  scope: globalScope(),
  id: `pricing:${request.serviceSlug}:global`,
  attributes: {
    serviceSlug: request.serviceSlug,
  },
});
