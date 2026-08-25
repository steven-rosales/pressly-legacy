import {
  makeProductionActorReadV1Capability,
  makeProductionScopeReconciliationV1Capability,
} from '@pressly/access-system/assembly/production-capabilities';
import { makeProductionLocationAuthority } from '@pressly/access-system/assembly/production-location-authority';
import type { IdSource } from '@pressly/cells/id-source';
import {
  makeProductionAuthorities,
  type ProductionAuthorities,
} from '@pressly/experience-control/cli/runtime';
import { makeIngressStateSystem } from '@pressly/ingress-system';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { makeProductionSystem } from '@pressly/production-system';
import type { Clock } from '@pressly/time';
import { presslyPostgresOwnerSchemas } from '../../pressly-postgres-schema.js';

export const makePresslyProductionAuthorities = (
  input: Readonly<{
    db: PostgresDatabase;
    clock: Clock;
    ids: IdSource;
  }>,
): ProductionAuthorities => {
  const location = makeProductionLocationAuthority({
    db: input.db,
    schema: presslyPostgresOwnerSchemas.access,
    clock: input.clock,
  });
  const production = makeProductionSystem({
    db: input.db,
    schema: presslyPostgresOwnerSchemas.production,
    clock: input.clock,
    ids: input.ids,
    productionActorReadV1: makeProductionActorReadV1Capability(
      input.db,
      presslyPostgresOwnerSchemas.access,
    ),
    productionScopeReconciliationV1:
      makeProductionScopeReconciliationV1Capability(
        input.db,
        presslyPostgresOwnerSchemas.access,
      ),
  });
  const ingress = makeIngressStateSystem({
    db: input.db,
    schema: presslyPostgresOwnerSchemas.ingress,
    clock: input.clock,
    ids: input.ids,
  });

  return makeProductionAuthorities({
    manageLocation: location.execute,
    manageProduction: production.cells.manageResources.execute,
    manageSourceLocationBindings:
      ingress.cells.reconcileSourceLocationBindings.execute,
  });
};
