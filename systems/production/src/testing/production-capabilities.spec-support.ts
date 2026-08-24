import {
  productionActorReadV1CapabilityContract,
  type ProductionActorReadV1Capability,
  type ProductionActorV1,
} from '@pressly/access-system/capabilities/production-actor-read-v1';
import {
  productionScopeReconciliationV1CapabilityContract,
  type ProductionScopeReconciliationV1Capability,
} from '@pressly/access-system/capabilities/production-scope-reconciliation-v1';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, asc, eq, inArray } from '@pressly/postgres/query';
import { productionTestSchema } from './production-schema.spec-support.ts';

export const productionActorReadTestCapability = (
  actors: readonly ProductionActorV1[] = [],
): ProductionActorReadV1Capability => {
  const ordered = Object.freeze(
    [...actors].sort((left, right) => left.id.localeCompare(right.id)),
  );
  return Object.freeze({
    contract: productionActorReadV1CapabilityContract,
    loadActors: async (input) => {
      const actorIds = new Set(input.actorIds);
      return ordered.filter((actor) => actorIds.has(actor.id));
    },
    findActorIdsByDisplayName: async (input) => {
      const query = input.query.toLocaleLowerCase();
      return ordered.flatMap((actor) =>
        actor.displayName?.toLocaleLowerCase().includes(query) === true
          ? [actor.id]
          : [],
      );
    },
  });
};

/**
 * Access capability double backed only by Production-local location facts.
 * Cross-owner SQL and the real Access adapter remain in verification.
 */
export const productionScopeReconciliationTestCapability = (
  database: PostgresDatabase,
): ProductionScopeReconciliationV1Capability => ({
  contract: productionScopeReconciliationV1CapabilityContract,
  load: async (input) => {
    const [location] = await database
      .select({
        id: productionTestSchema.productionLocations.id,
        businessId: productionTestSchema.productionLocations.businessId,
        name: productionTestSchema.productionLocations.name,
        timezone: productionTestSchema.productionLocations.timezone,
        isActive: productionTestSchema.productionLocations.isActive,
      })
      .from(productionTestSchema.productionLocations)
      .where(eq(productionTestSchema.productionLocations.id, input.locationId))
      .limit(1);
    return location ?? null;
  },
  list: (input) =>
    database
      .select({
        id: productionTestSchema.productionLocations.id,
        businessId: productionTestSchema.productionLocations.businessId,
        name: productionTestSchema.productionLocations.name,
        timezone: productionTestSchema.productionLocations.timezone,
        isActive: productionTestSchema.productionLocations.isActive,
      })
      .from(productionTestSchema.productionLocations)
      .where(
        and(
          input.includeInactive
            ? undefined
            : eq(productionTestSchema.productionLocations.isActive, true),
          input.locationIds === null
            ? undefined
            : inArray(productionTestSchema.productionLocations.id, [
                ...input.locationIds,
              ]),
        ),
      )
      .orderBy(
        asc(productionTestSchema.productionLocations.name),
        asc(productionTestSchema.productionLocations.id),
      ),
});
