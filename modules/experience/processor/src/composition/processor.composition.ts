import type { Database } from '@pressly/db/client';
import type { Clock } from '@pressly/time';
import { makeLoadOperationalOrderControlContexts } from '../features/orders/load-operational-order-contexts/load-operational-order-contexts.usecase.ts';
import { makeOperationalOrderIdentityQueries } from '../features/orders/resolve-operational-order-identities/resolve-operational-order-identities.usecase.ts';
import { makeResolveProcessorAccess } from '../features/session/resolve-processor-access/resolve-processor-access.usecase.ts';
import { makePostgresOperationalOrderAudit } from '../foundations/adapters/postgres/operational-order-audit/operational-order-audit.repo.ts';
import { makePostgresOperationalOrderIdentities } from '../foundations/adapters/postgres/operational-order-identity/operational-order-identity.repo.ts';
import { makePostgresProcessorAccessLocations } from '../foundations/adapters/postgres/processor-access-locations/processor-access-locations.repo.ts';
import type { ProcessorApplicationOrigins } from '../foundations/language/processor-access/processor-access.model.ts';
import type { ProductionCapabilitiesPort } from '../foundations/ports/production-capabilities/production-capabilities.port.ts';

export type ProcessorExperience = Readonly<{
  resolveAccess: ReturnType<typeof makeResolveProcessorAccess>;
  operationalOrderIdentities: ReturnType<
    typeof makeOperationalOrderIdentityQueries
  >;
  loadOperationalOrderControlContexts: ReturnType<
    typeof makeLoadOperationalOrderControlContexts
  >;
}>;

export type PostgresProcessorExperienceDeps = Readonly<{
  db: Database;
  clock: Clock;
  origins: ProcessorApplicationOrigins;
  productionCapabilities: ProductionCapabilitiesPort;
}>;

export const makePostgresProcessorExperience = (
  deps: PostgresProcessorExperienceDeps,
): ProcessorExperience => {
  const identities = makePostgresOperationalOrderIdentities(deps.db);

  return Object.freeze({
    resolveAccess: makeResolveProcessorAccess({
      locations: makePostgresProcessorAccessLocations(deps.db),
      capabilities: deps.productionCapabilities,
      origins: deps.origins,
      clock: deps.clock,
    }),
    operationalOrderIdentities: makeOperationalOrderIdentityQueries(identities),
    loadOperationalOrderControlContexts:
      makeLoadOperationalOrderControlContexts({
        identities,
        audit: makePostgresOperationalOrderAudit(deps.db),
      }),
  });
};

export {
  makeLoadOperationalOrderControlContexts,
  makeLoadOperationalOrderContexts,
  type LoadOperationalOrderControlContexts,
  type LoadOperationalOrderContexts,
} from '../features/orders/load-operational-order-contexts/load-operational-order-contexts.usecase.ts';
export type { OperationalOrderControlContextSource } from '../features/orders/load-operational-order-contexts/load-operational-order-contexts.model.ts';
export {
  makeOperationalOrderIdentityQueries,
  makeResolveOperationalOrderIdentities,
  type OperationalOrderIdentityQueries,
  type ResolveOperationalOrderIdentities,
} from '../features/orders/resolve-operational-order-identities/resolve-operational-order-identities.usecase.ts';
export type {
  BacklogOrderIdentitySource,
  ForecastOrderIdentitySource,
  ProductionBacklogIdentitySource,
  ProductionBoardIdentitySource,
  ProductionForecastIdentitySource,
  ProductionHistoryActivityIdentitySource,
  ProductionHistoryRunIdentitySource,
  ProductionOrderIdentitySource,
  ProductionWorkspaceIdentitySource,
} from '../features/orders/resolve-operational-order-identities/resolve-operational-order-identities.model.ts';
export {
  makeResolveProcessorAccess,
  type ResolveProcessorAccess,
} from '../features/session/resolve-processor-access/resolve-processor-access.usecase.ts';
export { resolveProcessorAccess } from '../features/session/resolve-processor-access/resolve-processor-access.policy.ts';
export {
  canonicalCustomerDisplayName,
  orderDemandReferenceId,
  productionOrderReferenceId,
  recentOperationalOrderAudit,
  uniqueOperationalOrderReferences,
} from '../foundations/language/operational-order/operational-order.policy.ts';
export type {
  CanonicalOrderContext,
  OperationalOrderAuditEntry,
  OperationalOrderAuditFacts,
  OperationalOrderContext,
  OperationalOrderContextResolution,
  OperationalOrderIdentity,
  OperationalOrderIdentityReference,
  OperationalOrderIdentityResolution,
} from '../foundations/language/operational-order/operational-order.model.ts';
export type {
  ProcessorAccess,
  ProcessorApplication,
  ProcessorCapability,
  ProcessorLocationAuthority,
  ProcessorRole,
  ProcessorRoleAssignment,
  ProcessorScope,
  ProcessorSession,
} from '../foundations/language/processor-access/processor-access.model.ts';
export type { OperationalOrderAuditPort } from '../foundations/ports/operational-order-audit/operational-order-audit.port.ts';
export type { OperationalOrderIdentityPort } from '../foundations/ports/operational-order-identity/operational-order-identity.port.ts';
export type { ProcessorAccessLocationsPort } from '../foundations/ports/processor-access-locations/processor-access-locations.port.ts';
export type {
  ProductionCapabilitiesPort,
  ResolveProductionCapabilities,
} from '../foundations/ports/production-capabilities/production-capabilities.port.ts';
