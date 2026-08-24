import type { PostgresDatabase } from '@pressly/postgres/client';
import { makeProductionSchema } from '../schema/production-schema.ts';

export const productionTestSchema = makeProductionSchema();

export type ProductionLocationTestSeed = Readonly<{
  id: string;
  businessId: string;
  name: string;
  timezone: string;
  isActive?: boolean;
}>;

/** Seeds only Production's operational location projection. */
export const seedProductionLocationTestFacts = async (
  database: PostgresDatabase,
  locations: readonly ProductionLocationTestSeed[],
): Promise<void> => {
  await database
    .insert(productionTestSchema.productionLocations)
    .values(locations.map((location) => ({ ...location })));
};
