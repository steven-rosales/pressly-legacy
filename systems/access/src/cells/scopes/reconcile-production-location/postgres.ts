import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { eq, sql } from '@pressly/postgres/query';
import { defineUnitOfWork } from '@pressly/postgres/unit-of-work';
import type { AccessSchema } from '../../../schema/public.ts';
import type { ReconcileProductionLocationRepository } from './execute.ts';
import type { AccessProductionLocation } from './types.ts';

export const makeReconcileProductionLocationPostgresRepository = (
  database: PostgresDatabase,
  access: Pick<AccessSchema, 'businessAccounts' | 'accessProductionLocations'>,
): ReconcileProductionLocationRepository => {
  const unitOfWork = defineUnitOfWork(database, (db: PostgresExecutor) => ({
    lock: async (locationId: string) => {
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtext('access-production-location'), hashtext(${locationId}))`,
      );
    },
    load: async (location: AccessProductionLocation) => {
      const [[business], [stored]] = await Promise.all([
        db
          .select({ id: access.businessAccounts.id })
          .from(access.businessAccounts)
          .where(eq(access.businessAccounts.id, location.businessId))
          .limit(1),
        db
          .select({
            id: access.accessProductionLocations.id,
            businessId: access.accessProductionLocations.businessId,
            name: access.accessProductionLocations.name,
            timezone: access.accessProductionLocations.timezone,
            isActive: access.accessProductionLocations.isActive,
          })
          .from(access.accessProductionLocations)
          .where(eq(access.accessProductionLocations.id, location.id))
          .limit(1),
      ]);
      return {
        businessExists: business !== undefined,
        stored: stored ?? null,
      };
    },
    save: async (location: AccessProductionLocation, now: Date) => {
      await db
        .insert(access.accessProductionLocations)
        .values({ ...location, updatedAt: now })
        .onConflictDoUpdate({
          target: access.accessProductionLocations.id,
          set: {
            name: location.name,
            timezone: location.timezone,
            isActive: location.isActive,
            updatedAt: now,
          },
        });
    },
  }));
  return Object.freeze({ transaction: unitOfWork.transaction });
};
