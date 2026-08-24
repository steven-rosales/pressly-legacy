import { describe, expect, it } from 'vitest';
import { pricingCatalogResource } from './pricing-resource.value.ts';

describe('pricing access-control resources', () => {
  it('maps global pricing requests to a global catalog resource', () => {
    const resource = pricingCatalogResource({
      serviceSlug: 'wash-fold',
    });

    expect(resource).toEqual({
      kind: 'pricing.catalog',
      id: 'pricing:wash-fold:global',
      scope: { kind: 'global', id: '*' },
      attributes: {
        serviceSlug: 'wash-fold',
      },
    });
  });
});
