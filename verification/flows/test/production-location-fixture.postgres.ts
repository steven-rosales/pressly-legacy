import type { PostgresDatabase } from '@pressly/postgres/client';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';

export type ProductionLocationFixtureFacts = Readonly<{
  id: string;
  businessId: string;
  name: string;
  timezone: string;
  isActive?: boolean;
  liveRevision?: number;
  createdAt?: Date;
  updatedAt?: Date;
}>;

/** Seeds only Production's owner-local operational location projection. */
export const seedProductionLocationFixture = async (
  database: PostgresDatabase,
  location: ProductionLocationFixtureFacts,
): Promise<void> => {
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionLocations)
    .values({ ...location });
};
