import {
  productionActorReadV1CapabilityContract,
  type ProductionActorReadV1Capability,
} from '@pressly/access-system/capabilities/production-actor-read-v1';
import {
  productionScopeReconciliationV1CapabilityContract,
  type ProductionScopeReconciliationV1Capability,
} from '@pressly/access-system/capabilities/production-scope-reconciliation-v1';
import type { ProductionSystemDependencies } from '@pressly/production-system/testing/assembly';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';

const unusedActorRead: ProductionActorReadV1Capability = Object.freeze({
  contract: productionActorReadV1CapabilityContract,
  loadActors: async () => [],
  findActorIdsByDisplayName: async () => [],
});

const unusedScopeReconciliation: ProductionScopeReconciliationV1Capability =
  Object.freeze({
    contract: productionScopeReconciliationV1CapabilityContract,
    load: async () => null,
    list: async () => [],
  });

/**
 * Production-only queries do not consume Access reads. These data-only empty
 * capabilities satisfy whole-System assembly without introducing peer SQL.
 */
export const productionOnlySystemDependencies = (): Pick<
  ProductionSystemDependencies,
  'productionActorReadV1' | 'productionScopeReconciliationV1' | 'schema'
> =>
  Object.freeze({
    schema: presslyPostgresOwnerSchemas.production,
    productionActorReadV1: unusedActorRead,
    productionScopeReconciliationV1: unusedScopeReconciliation,
  });
