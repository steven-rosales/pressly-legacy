import type { PostgresTransaction } from '@pressly/postgres/client';
import { and, eq } from '@pressly/postgres/query';
import type { AccessSchema } from '../../schema/public.ts';

export const locationBelongsToBusiness = async (
  tx: PostgresTransaction,
  business: Pick<AccessSchema, 'accessProductionLocations'>,
  businessId: string,
  locationId: string | null,
): Promise<boolean> => {
  if (locationId === null) return true;
  const [location] = await tx
    .select({ id: business.accessProductionLocations.id })
    .from(business.accessProductionLocations)
    .where(
      and(
        eq(business.accessProductionLocations.businessId, businessId),
        eq(business.accessProductionLocations.id, locationId),
      ),
    )
    .limit(1);
  return location !== undefined;
};
