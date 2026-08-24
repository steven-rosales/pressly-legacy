import type { PostgresDatabase } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import {
  orderLocationFactsV1CapabilityContract,
  type OrderLocationFactsV1Capability,
} from '../contracts/order-location-facts-v1.ts';
import type { AccessSchema } from '../schema/public.ts';

export const makeOrderLocationFactsV1Capability = (
  database: PostgresDatabase,
  access: Pick<AccessSchema, 'accessProductionLocations'>,
): OrderLocationFactsV1Capability =>
  Object.freeze({
    contract: orderLocationFactsV1CapabilityContract,
    execute: async (input) => {
      const [location] = await database
        .select({
          businessId: access.accessProductionLocations.businessId,
          isActive: access.accessProductionLocations.isActive,
        })
        .from(access.accessProductionLocations)
        .where(eq(access.accessProductionLocations.id, input.locationId))
        .limit(1);

      return location ?? null;
    },
  });
