import { describe, expect, it } from 'vitest';
import { pricingCatalogResourceFromRequest } from '../../src/pricing/pricing.resource.ts';

describe('pricing access-control resources', () => {
  it('maps global pricing requests to a global catalog resource', () => {
    const resource = pricingCatalogResourceFromRequest({
      serviceSlug: 'wash-fold',
      reason: 'Update delivery fee',
      items: [{ code: 'delivery_fee', priceCents: 100 }],
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
