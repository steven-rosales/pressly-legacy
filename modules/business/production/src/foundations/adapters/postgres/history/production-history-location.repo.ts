import { type DatabaseExecutor } from '@pressly/db/client';
import { eq } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';

export const productionHistoryLocationExists = async (
  db: DatabaseExecutor,
  locationId: string,
): Promise<boolean> => {
  const [location] = await db
    .select({ id: laundryProduction.productionLocations.id })
    .from(laundryProduction.productionLocations)
    .where(eq(laundryProduction.productionLocations.id, locationId))
    .limit(1);

  return location !== undefined;
};
