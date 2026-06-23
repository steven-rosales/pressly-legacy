import { describe, expect, it } from 'vitest';
import { pricingCatalogResourceFromRequest } from '../../src/resources/pricing.resources.ts';

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

  it('maps location pricing requests to a location-scoped catalog resource', () => {
    const resource = pricingCatalogResourceFromRequest({
      serviceSlug: 'dry-cleaning',
      locationSlug: 'new-york',
      reason: 'Update dry cleaning price',
      items: [{ code: 'shirt', priceCents: 1295 }],
    });

    expect(resource).toEqual({
      kind: 'pricing.catalog',
      id: 'pricing:dry-cleaning:location:new-york',
      scope: { kind: 'location', id: 'new-york' },
      attributes: {
        serviceSlug: 'dry-cleaning',
        locationSlug: 'new-york',
      },
    });
  });
});
