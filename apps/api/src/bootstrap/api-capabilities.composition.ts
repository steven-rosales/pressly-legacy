import { makeAccessControlModule } from '@pressly/access-control';
import { makeAuthModule } from '@pressly/auth-module';
import { revealSecret } from '@pressly/config';
import { makePostgresOrdersApplication } from '@pressly/orders';
import { makePricingModule } from '@pressly/pricing';
import { makePostgresProductionModule } from '@pressly/production';
import { makeProductionPolicy } from '@pressly/production-policy';
import { makeProductionScheduler } from '@pressly/production-scheduling';
import {
  makePostgresCanonicalSourceUserAcceptanceAdapter,
  makePostgresUsersApplication,
} from '@pressly/users';
import { makePostgresWebhookIngestionApplication } from '@pressly/webhook-ingestion';
import { makeProcessorBrowserBoundary } from '../http/processor/session/processor-session.boundary.ts';
import { makeProcessorAccessResolver } from '../http/processor/session/processor-access.query.ts';
import { makeControlBrowserBoundary } from '../http/control/session/control-session.boundary.ts';
import type { ApiRuntime } from '../runtime/api-runtime.ts';
import { makeProductionDomainSignals } from './production-signals.adapter.ts';
import { makePostgresLocationAncestryAdapter } from '../http/authorization/postgres-location-ancestry.adapter.ts';

export type ApiClock = Readonly<{ now: () => Date }>;
export type ApiIds = Readonly<{ next: () => string }>;

export type ApiCapabilities = Readonly<{
  accessControlModule: ReturnType<typeof makeAccessControlModule>;
  authModule: ReturnType<typeof makeAuthModule>;
  controlBoundary: ReturnType<typeof makeControlBrowserBoundary>;
  locationAncestry: ReturnType<typeof makePostgresLocationAncestryAdapter>;
  orders: ReturnType<typeof makePostgresOrdersApplication>;
  pricingModule: ReturnType<typeof makePricingModule>;
  processorBoundary: ReturnType<typeof makeProcessorBrowserBoundary>;
  productionModule: ReturnType<typeof makePostgresProductionModule>;
  users: ReturnType<typeof makePostgresUsersApplication>;
  webhookIngestion: ReturnType<typeof makePostgresWebhookIngestionApplication>;
}>;

export const makeApiCapabilities = (input: {
  runtime: ApiRuntime;
  clock: ApiClock;
  ids: ApiIds;
}): ApiCapabilities => {
  const webhookIngestion = makePostgresWebhookIngestionApplication({
    db: input.runtime.database.db,
    clock: input.clock,
    ids: input.ids,
    quarantineRetentionMs:
      input.runtime.env.centsWebhook.quarantine.retentionMs,
  });
  const authModule = makeAuthModule({
    db: input.runtime.database.db,
    tokenSecret: revealSecret(input.runtime.env.auth.secret),
    sessionTtlMinutes: input.runtime.env.auth.sessionTtlMinutes,
    sessionIdleTimeoutMinutes: input.runtime.env.auth.sessionIdleTimeoutMinutes,
    loginWindowMinutes: input.runtime.env.auth.loginWindowMinutes,
    loginMaxFailures: input.runtime.env.auth.loginMaxFailures,
    mfaChallengeTtlMinutes: input.runtime.env.auth.mfaChallengeTtlMinutes,
    securityEvents: input.runtime.securityEvents,
    mfaEncryptionKey: revealSecret(input.runtime.env.auth.mfaEncryptionKey),
    mfaIssuer: input.runtime.env.auth.mfaIssuer,
  });
  const locationAncestry = makePostgresLocationAncestryAdapter(
    input.runtime.database.db,
  );
  const accessControlModule = makeAccessControlModule({
    auth: authModule.guards,
    locationAncestry,
    clock: input.clock,
    policies: {
      pricing: {
        freshSessionMaxAgeMinutes:
          input.runtime.env.auth.freshSessionMaxAgeMinutes,
      },
      authSessions: {
        freshSessionMaxAgeMinutes:
          input.runtime.env.auth.freshSessionMaxAgeMinutes,
      },
      mfa: {
        freshSessionMaxAgeMinutes:
          input.runtime.env.auth.freshSessionMaxAgeMinutes,
      },
    },
  });
  const processorBoundary = makeProcessorBrowserBoundary({
    application: authModule.application,
    resolveAccess: makeProcessorAccessResolver({
      db: input.runtime.database.db,
      processorOrigin: input.runtime.env.processor.origin,
      controlOrigin: input.runtime.env.control.origin,
    }),
    bearerAuthenticate: authModule.guards.authenticate,
    options: {
      origin: input.runtime.env.processor.origin,
      csrfSecret: revealSecret(input.runtime.env.processor.csrfSecret),
      secureCookies: input.runtime.env.nodeEnv === 'production',
    },
  });
  const controlBoundary = makeControlBrowserBoundary({
    db: input.runtime.database.db,
    application: authModule.application,
    options: {
      origin: input.runtime.env.control.origin,
      csrfSecret: revealSecret(input.runtime.env.control.csrfSecret),
      processorOrigin: input.runtime.env.processor.origin,
      secureCookies: input.runtime.env.nodeEnv === 'production',
    },
  });
  const pricingModule = makePricingModule({
    db: input.runtime.database.db,
    auth: accessControlModule.pricing,
  });
  const productionModule = makePostgresProductionModule({
    db: input.runtime.database.db,
    policy: makeProductionPolicy(),
    scheduler: makeProductionScheduler(),
    clock: input.clock,
    ids: input.ids,
    signals: makeProductionDomainSignals(input.runtime.observability.counters),
    security: {
      ...accessControlModule.production,
      authenticate: processorBoundary.authenticate,
    },
  });
  const users = makePostgresUsersApplication({
    db: input.runtime.database.db,
    clock: input.clock,
  });
  const incomingOrderProposalCustomer =
    makePostgresCanonicalSourceUserAcceptanceAdapter();
  const orders = makePostgresOrdersApplication({
    db: input.runtime.database.db,
    clock: input.clock,
    incomingOrderProposalCustomer,
  });

  return {
    accessControlModule,
    authModule,
    controlBoundary,
    locationAncestry,
    orders,
    pricingModule,
    processorBoundary,
    productionModule,
    users,
    webhookIngestion,
  } as const;
};
