import type { PostgresDatabase } from '@pressly/postgres/client';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';

export type ProductionLocationConformanceFacts = Readonly<{
  id: string;
  businessId: string;
  name: string;
  timezone: string;
  isActive?: boolean;
  liveRevision?: number;
  createdAt?: Date;
  updatedAt?: Date;
}>;

/** Seeds only Production's owner-local location projection. */
export const seedProductionLocationConformanceFacts = async (
  database: PostgresDatabase,
  locations: readonly ProductionLocationConformanceFacts[],
): Promise<void> => {
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionLocations)
    .values(locations.map((location) => ({ ...location })));
};
