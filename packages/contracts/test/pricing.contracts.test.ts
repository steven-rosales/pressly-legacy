import { describe, expect, it } from 'vitest';
import {
  pricingCatalogSchema,
  pricingChangePlanSchema,
  publishPricingChangeResultSchema,
} from '../src/pricing/index.ts';

describe('pricing response contracts', () => {
  it('accepts serialized pricing catalog timestamps', () => {
    const catalog = {
      serviceSlug: 'wash-fold',
      currency: 'USD',
      updatedAt: '2026-08-02T12:00:00.000Z',
      items: [],
    };

    expect(pricingCatalogSchema.parse(catalog)).toEqual(catalog);
    expect(
      pricingCatalogSchema.safeParse({
        ...catalog,
        updatedAt: new Date(catalog.updatedAt),
      }).success,
    ).toBe(false);
  });

  it('validates pricing change plans as wire results', () => {
    const plan = {
      serviceSlug: 'dry-cleaning',
      reason: 'Update garment pricing',
      oldPricingSetId: 'set-1',
      currency: 'USD',
      changes: [
        {
          code: 'shirt',
          name: 'Shirt',
          oldPriceCents: 495,
          newPriceCents: 595,
        },
      ],
    };

    expect(pricingChangePlanSchema.parse(plan)).toEqual(plan);
    expect(
      pricingChangePlanSchema.safeParse({ ...plan, unexpected: true }).success,
    ).toBe(false);
  });

  it('rejects malformed publish results', () => {
    expect(
      publishPricingChangeResultSchema.safeParse({
        oldPricingSetId: 'set-1',
        newPricingSetId: 'set-2',
        auditEventId: 'event-1',
        changeItemCount: -1,
      }).success,
    ).toBe(false);
  });
});
