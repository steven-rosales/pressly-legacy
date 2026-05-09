import type { Database } from '@pressly/db';
import { makePostgresPricingReader } from './adapters/persistence/pricing.repo.ts';
import { makePricingRoutes } from './adapters/http/pricing.routes.ts';
import { makeGetPricing } from './features/get-pricing/get-pricing.usecase.ts';

export type PricingModuleDeps = Readonly<{ db: Database }>;

export const makePricingModule = ({ db }: PricingModuleDeps) => {
  const pricingReader = makePostgresPricingReader(db);
  const getPricing = makeGetPricing(pricingReader);
  const routes = makePricingRoutes({ getPricing });

  return { routes };
};
