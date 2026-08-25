import type {
  ProductionActorReadV1Capability,
  ProductionActorV1,
} from '../contracts/production-actor-read-v1.ts';
import { productionActorReadV1CapabilityContract } from '../contracts/production-actor-read-v1.ts';
import type {
  ProductionScopeReconciliationV1Capability,
  ProductionScopeLocationV1,
} from '../contracts/production-scope-reconciliation-v1.ts';
import { productionScopeReconciliationV1CapabilityContract } from '../contracts/production-scope-reconciliation-v1.ts';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, asc, eq, inArray, sql } from '@pressly/postgres/query';
import type { AccessSchema } from '../schema/public.ts';

const locationProjection = (
  access: Pick<AccessSchema, 'accessProductionLocations'>,
) => ({
  id: access.accessProductionLocations.id,
  businessId: access.accessProductionLocations.businessId,
  name: access.accessProductionLocations.name,
  timezone: access.accessProductionLocations.timezone,
  isActive: access.accessProductionLocations.isActive,
});

export const makeProductionActorReadV1Capability = (
  database: PostgresDatabase,
  access: Pick<AccessSchema, 'authIdentities'>,
): ProductionActorReadV1Capability =>
  Object.freeze({
    contract: productionActorReadV1CapabilityContract,
    loadActors: async (input): Promise<readonly ProductionActorV1[]> => {
      const actorIds = [...new Set(input.actorIds)];
      if (actorIds.length === 0) return [];
      return database
        .select({
          id: access.authIdentities.id,
          displayName: access.authIdentities.displayName,
        })
        .from(access.authIdentities)
        .where(inArray(access.authIdentities.id, actorIds))
        .orderBy(asc(access.authIdentities.id));
    },
    findActorIdsByDisplayName: (input) =>
      database
        .select({ id: access.authIdentities.id })
        .from(access.authIdentities)
        .where(
          sql`strpos(lower(coalesce(${access.authIdentities.displayName}, '')), lower(${input.query})) > 0`,
        )
        .orderBy(asc(access.authIdentities.id))
        .then((rows) => rows.map((row) => row.id)),
  });

export const makeProductionScopeReconciliationV1Capability = (
  database: PostgresDatabase,
  access: Pick<AccessSchema, 'accessProductionLocations'>,
): ProductionScopeReconciliationV1Capability =>
  Object.freeze({
    contract: productionScopeReconciliationV1CapabilityContract,
    load: async (input): Promise<ProductionScopeLocationV1 | null> => {
      const [location] = await database
        .select(locationProjection(access))
        .from(access.accessProductionLocations)
        .where(eq(access.accessProductionLocations.id, input.locationId))
        .limit(1);
      return location ?? null;
    },
    list: (input) =>
      database
        .select(locationProjection(access))
        .from(access.accessProductionLocations)
        .where(
          and(
            input.includeInactive
              ? undefined
              : eq(access.accessProductionLocations.isActive, true),
            input.locationIds === null
              ? undefined
              : inArray(access.accessProductionLocations.id, [
                  ...input.locationIds,
                ]),
          ),
        )
        .orderBy(
          asc(access.accessProductionLocations.name),
          asc(access.accessProductionLocations.id),
        ),
  });

export const makeAccessProductionCapabilities = (
  database: PostgresDatabase,
  access: Pick<AccessSchema, 'authIdentities' | 'accessProductionLocations'>,
) =>
  Object.freeze({
    productionActorReadV1: makeProductionActorReadV1Capability(
      database,
      access,
    ),
    productionScopeReconciliationV1:
      makeProductionScopeReconciliationV1Capability(database, access),
  });
