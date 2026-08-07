import { result, type Result } from '@pressly/kernel';

import type { LoadPricingCatalogFailure } from '../../src/features/catalog/load-pricing-catalog/load-pricing-catalog.failure.ts';
import type {
  LoadPricingCatalogCommand,
  PricingCatalog,
} from '../../src/features/catalog/load-pricing-catalog/load-pricing-catalog.model.ts';
import type { EffectivePricingCatalogFinder } from '../../src/features/catalog/load-pricing-catalog/load-pricing-catalog.port.ts';

type FakeEffectivePricingCatalogFinderInput = Partial<
  Readonly<{
    result: Result<PricingCatalog, LoadPricingCatalogFailure>;
  }>
>;

export const makeFakeEffectivePricingCatalogFinder = (
  input: FakeEffectivePricingCatalogFinderInput = {},
) => {
  const calls = {
    find: [] as LoadPricingCatalogCommand[],
  };

  const catalogResult =
    input.result ??
    result.ok({
      serviceSlug: 'wash-fold',
      currency: 'USD',
      updatedAt: new Date('2026-05-21T12:00:00.000Z'),
      items: [
        {
          service: 'wash_fold',
          unit: 'order',
          category: 'Fee',
          name: 'Delivery Fee',
          priceCents: 495,
          sortOrder: 30,
          metadata: {},
        },
      ],
    });

  const finder: EffectivePricingCatalogFinder = {
    findEffectivePricingCatalog: async (command) => {
      calls.find.push(command);
      return catalogResult;
    },
  };

  return { finder, calls };
};
