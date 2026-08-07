import { result } from '@pressly/kernel';
import { describe, expect, it } from 'vitest';
import { makeLoadPricingCatalog } from '../../../../src/features/catalog/load-pricing-catalog/load-pricing-catalog.usecase.ts';
import { expectErrCode, expectOk } from '@pressly/testkit/result';
import { makeLoadPricingCatalogCommand } from '../../../support/load-pricing-catalog.builder.ts';
import { makeFakeEffectivePricingCatalogFinder } from '../../../support/load-pricing-catalog.fake.ts';

describe('load pricing catalog usecase', () => {
  it('delegates to the effective pricing finder', async () => {
    const { finder, calls } = makeFakeEffectivePricingCatalogFinder();
    const loadPricingCatalog = makeLoadPricingCatalog(finder);

    const actual = await loadPricingCatalog(makeLoadPricingCatalogCommand());

    const value = expectOk(actual);

    expect(value).toMatchObject({
      serviceSlug: 'wash-fold',
      currency: 'USD',
      items: [
        {
          name: 'Delivery Fee',
          priceCents: 495,
        },
      ],
    });
    expect(calls.find).toEqual([
      {
        serviceSlug: 'wash-fold',
      },
    ]);
  });

  it('returns finder failures unchanged', async () => {
    const expectedFailure = {
      code: 'pricing_not_found',
      serviceSlug: 'wash-fold',
      missing: 'service',
    } as const;
    const { finder } = makeFakeEffectivePricingCatalogFinder({
      result: result.err(expectedFailure),
    });
    const loadPricingCatalog = makeLoadPricingCatalog(finder);

    const actual = await loadPricingCatalog(makeLoadPricingCatalogCommand());

    expectErrCode(actual, 'pricing_not_found');
  });
});
