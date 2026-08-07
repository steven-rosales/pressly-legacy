import type { Database } from '@pressly/db/client';
import type { Clock } from '@pressly/time';
import { makeLoadOperationalOrderControlContexts } from '../features/orders/load-operational-order-contexts/load-operational-order-control-contexts.adapter.ts';
import { makePostgresLoadOperationalOrderAudit } from '../features/orders/load-operational-order-contexts/load-operational-order-contexts.repo.ts';
import { makeResolveBacklogOrderIdentities } from '../features/orders/resolve-backlog-order-identities/resolve-backlog-order-identities.usecase.ts';
import { makeResolveBoardOrderIdentities } from '../features/orders/resolve-board-order-identities/resolve-board-order-identities.usecase.ts';
import { makeResolveForecastOrderIdentities } from '../features/orders/resolve-forecast-order-identities/resolve-forecast-order-identities.usecase.ts';
import { makeResolveHistoryActivityOrderIdentities } from '../features/orders/resolve-history-activity-order-identities/resolve-history-activity-order-identities.usecase.ts';
import { makeResolveHistoryRunOrderIdentities } from '../features/orders/resolve-history-run-order-identities/resolve-history-run-order-identities.usecase.ts';
import { makeResolveWorkspaceOrderIdentities } from '../features/orders/resolve-workspace-order-identities/resolve-workspace-order-identities.usecase.ts';
import { makeResolveProcessorAccess } from '../features/session/resolve-processor-access/resolve-processor-access.usecase.ts';
import { makePostgresListProcessorAccessLocations } from '../features/session/resolve-processor-access/resolve-processor-access.repo.ts';
import type { ResolveProductionCapabilities } from '../features/session/resolve-processor-access/resolve-processor-access.port.ts';
import { makePostgresOperationalOrderIdentities } from '../foundations/adapters/postgres/operational-order-identity/operational-order-identity.repo.ts';
import type { ProcessorApplicationOrigins } from '../features/session/resolve-processor-access/resolve-processor-access.model.ts';
import type { OperationalOrderIdentityPort } from '../foundations/ports/operational-order-identity/operational-order-identity.port.ts';

export type OperationalOrderIdentityQueries = Readonly<{
  forBoard: ReturnType<typeof makeResolveBoardOrderIdentities>;
  forWorkspace: ReturnType<typeof makeResolveWorkspaceOrderIdentities>;
  forForecast: ReturnType<typeof makeResolveForecastOrderIdentities>;
  forHistoryRun: ReturnType<typeof makeResolveHistoryRunOrderIdentities>;
  forBacklog: ReturnType<typeof makeResolveBacklogOrderIdentities>;
  forHistoryActivity: ReturnType<
    typeof makeResolveHistoryActivityOrderIdentities
  >;
}>;

export const makeOperationalOrderIdentityQueries = (
  identities: OperationalOrderIdentityPort,
): OperationalOrderIdentityQueries =>
  Object.freeze({
    forBoard: makeResolveBoardOrderIdentities(identities),
    forWorkspace: makeResolveWorkspaceOrderIdentities(identities),
    forForecast: makeResolveForecastOrderIdentities(identities),
    forHistoryRun: makeResolveHistoryRunOrderIdentities(identities),
    forBacklog: makeResolveBacklogOrderIdentities(identities),
    forHistoryActivity: makeResolveHistoryActivityOrderIdentities(identities),
  });

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
  resolveProductionCapabilities: ResolveProductionCapabilities;
}>;

export const makePostgresProcessorExperience = (
  deps: PostgresProcessorExperienceDeps,
): ProcessorExperience => {
  const identities = makePostgresOperationalOrderIdentities(deps.db);

  return Object.freeze({
    resolveAccess: makeResolveProcessorAccess({
      listLocations: makePostgresListProcessorAccessLocations(deps.db),
      resolveCapabilities: deps.resolveProductionCapabilities,
      origins: deps.origins,
      clock: deps.clock,
    }),
    operationalOrderIdentities: makeOperationalOrderIdentityQueries(identities),
    loadOperationalOrderControlContexts:
      makeLoadOperationalOrderControlContexts({
        identities,
        loadAudit: makePostgresLoadOperationalOrderAudit(deps.db),
      }),
  });
};
