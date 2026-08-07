import { globalScope, type AuthResource } from '@pressly/auth/authorization';

export type PricingCatalogResourceInput = Readonly<{
  serviceSlug: string;
}>;

export type PricingCatalogResource = Omit<AuthResource, 'kind' | 'attributes'> &
  Readonly<{
    kind: 'pricing.catalog';
    attributes: Readonly<{ serviceSlug: string }>;
  }>;

export const pricingCatalogResource = (
  input: PricingCatalogResourceInput,
): PricingCatalogResource => ({
  kind: 'pricing.catalog',
  scope: globalScope(),
  id: `pricing:${input.serviceSlug}:global`,
  attributes: {
    serviceSlug: input.serviceSlug,
  },
});
