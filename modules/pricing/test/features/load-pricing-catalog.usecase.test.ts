import { describe, expect, it } from 'vitest';
import { makeAppError, err } from '@pressly/errors';
import { makeLoadPricingCatalog } from '../../src/features/load-pricing-catalog/load-pricing-catalog.usecase.ts';
import { expectErrCode, expectOk } from '@pressly/testkit/result';
import { makeLoadPricingCatalogCommand } from '../support/builders.ts';
import { makeFakeEffectivePricingCatalogFinder } from '../support/fakes.ts';

describe('load pricing catalog usecase', () => {
  it('delegates to the effective pricing finder', async () => {
    const { finder, calls } = makeFakeEffectivePricingCatalogFinder();
    const loadPricingCatalog = makeLoadPricingCatalog(finder);

    const result = await loadPricingCatalog(
      makeLoadPricingCatalogCommand({ locationSlug: 'fort-lee' }),
    );

    const value = expectOk(result);

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
        locationSlug: 'fort-lee',
      },
    ]);
  });

  it('returns finder failures unchanged', async () => {
    const expectedError = makeAppError({
      kind: 'NotFoundError',
      code: 'pricing_not_found',
      message: 'Pricing was not found.',
      status: 404,
    });
    const { finder } = makeFakeEffectivePricingCatalogFinder({
      result: err(expectedError),
    });
    const loadPricingCatalog = makeLoadPricingCatalog(finder);

    const result = await loadPricingCatalog(makeLoadPricingCatalogCommand());

    expectErrCode(result, 'pricing_not_found');
  });
});
