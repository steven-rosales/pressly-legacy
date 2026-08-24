import type { PostgresDatabase } from '@pressly/postgres/client';
import type { Clock } from '@pressly/time';
import { makeLoadPricingCatalogCell } from './cells/catalog/load-pricing-catalog/cell.ts';
import { makeLoadPricingCatalogPostgresRepository } from './cells/catalog/load-pricing-catalog/postgres.ts';
import { makePlanPricingChangeCell } from './cells/pricebook/plan-pricing-change/cell.ts';
import { makePublishPricingChangeCell } from './cells/pricebook/publish-pricing-change/cell.ts';
import { makePostgresPricingChangePublisher } from './cells/pricebook/publish-pricing-change/postgres.ts';
import { makePostgresCurrentPricingReader } from './postgres/current-pricing.postgres.ts';
import type { PricingSchema } from './schema/pricing.ts';

export type PricingSystemDependencies = Readonly<{
  db: PostgresDatabase;
  schema: PricingSchema;
  clock: Clock;
}>;

export const makePricingSystem = (dependencies: PricingSystemDependencies) => {
  const loadCurrentPricing = makePostgresCurrentPricingReader(
    dependencies.db,
    dependencies.schema,
  );
  return Object.freeze({
    cells: Object.freeze({
      loadPricingCatalog: makeLoadPricingCatalogCell(
        makeLoadPricingCatalogPostgresRepository(
          dependencies.db,
          dependencies.schema,
        ),
      ),
      planPricingChange: makePlanPricingChangeCell({ loadCurrentPricing }),
      publishPricingChange: makePublishPricingChangeCell({
        loadCurrentPricing,
        publishPricingChange: makePostgresPricingChangePublisher(
          dependencies.db,
          dependencies.schema,
        ),
        clock: dependencies.clock,
      }),
    }),
  });
};

export type PricingSystem = ReturnType<typeof makePricingSystem>;
