import type { Database } from '@pressly/db/client';
import { and, asc, eq } from '@pressly/db/query';
import * as business from '@pressly/db/schema/business';
import type { ListProcessorAccessLocations } from './resolve-processor-access.port.ts';

export const makePostgresListProcessorAccessLocations =
  (db: Database): ListProcessorAccessLocations =>
  () =>
    db
      .select({
        id: business.productionLocations.id,
        businessId: business.productionLocations.businessId,
        name: business.productionLocations.name,
        timezone: business.productionLocations.timezone,
      })
      .from(business.productionLocations)
      .innerJoin(
        business.businessAccounts,
        eq(
          business.businessAccounts.id,
          business.productionLocations.businessId,
        ),
      )
      .where(
        and(
          eq(business.productionLocations.isActive, true),
          eq(business.businessAccounts.status, 'active'),
        ),
      )
      .orderBy(
        asc(business.productionLocations.businessId),
        asc(business.productionLocations.name),
      );
