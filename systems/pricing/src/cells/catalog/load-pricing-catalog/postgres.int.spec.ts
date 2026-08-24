import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  makePricingPostgresSystem,
  pricingPostgresDatabase,
  registerPricingPostgresLifecycle,
  seedPricing,
} from '../../../testing/pricing-postgres.fixture.ts';
import { loadPricingCatalogCellDeclaration } from './cell.ts';

registerPricingPostgresLifecycle();

proveOperation({
  operationId: 'pricing.load-pricing-catalog.v1',
  declaration: loadPricingCatalogCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'stable_catalog_projection_and_empty_state',
      proves: ['executor-success'],
      run: async () => {
        await seedPricing();
        const execute =
          makePricingPostgresSystem().cells.loadPricingCatalog.execute;

        await expect(
          execute({ serviceSlug: 'wash-fold' }),
        ).resolves.toMatchObject({
          kind: 'success',
          value: {
            serviceSlug: 'wash-fold',
            currency: 'USD',
            items: [
              { name: 'Delivery Fee', priceCents: 495, sortOrder: 30 },
              { name: 'Hang Dry', priceCents: 295, sortOrder: 40 },
            ],
          },
        });

        await pricingPostgresDatabase.reset();
        await seedPricing({ items: [] });
        await expect(
          execute({ serviceSlug: 'wash-fold' }),
        ).resolves.toMatchObject({
          kind: 'success',
          value: { items: [] },
        });
      },
    },
  ],
});
