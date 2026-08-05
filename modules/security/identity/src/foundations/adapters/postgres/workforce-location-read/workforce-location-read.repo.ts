import type { DatabaseTransaction } from '@pressly/db/client';
import { and, eq } from '@pressly/db/query';
import * as business from '@pressly/db/schema/business';

export const locationBelongsToBusiness = async (
  tx: DatabaseTransaction,
  businessId: string,
  locationId: string | null,
): Promise<boolean> => {
  if (locationId === null) return true;
  const [location] = await tx
    .select({ id: business.productionLocations.id })
    .from(business.productionLocations)
    .where(
      and(
        eq(business.productionLocations.businessId, businessId),
        eq(business.productionLocations.id, locationId),
      ),
    )
    .limit(1);
  return location !== undefined;
};
