import { makeAuthorizationModule } from '@pressly/authorization';
import { makeIdentityModule } from '@pressly/identity';
import { revealSecret } from '@pressly/config';
import { makeControlExperience } from '@pressly/control-experience';
import type { IdSource } from '@pressly/kernel';
import { makePostgresOrdersApplication } from '@pressly/orders';
import { makePricingModule } from '@pressly/pricing';
import { makePostgresProcessorExperience } from '@pressly/processor-experience';
import { makePostgresProductionModule } from '@pressly/production';
import {
  makePostgresCanonicalSourceUserAcceptanceAdapter,
  makePostgresUsersApplication,
} from '@pressly/users';
import { makePostgresWebhookIngestionApplication } from '@pressly/webhook-ingestion';
import type { Clock } from '@pressly/time';
import { makeProcessorBrowserBoundary } from '../http/processor/session/processor-session.composition.ts';
import { makeControlBrowserBoundary } from '../http/control/session/control-session.boundary.ts';
import type { ApiRuntime } from '../runtime/api-runtime.ts';
import { makeProductionDomainSignals } from './production-signals.adapter.ts';
import { makePostgresLocationAncestryAdapter } from '../http/authorization/postgres-location-ancestry.adapter.ts';
import { makeApiAccessControl } from '../http/authorization/access-control.composition.ts';
import {
  adaptControlCustomers,
  adaptControlOrders,
  adaptControlWorkforce,
} from '../http/control/control-experience.adapter.ts';

export type ApiCapabilities = Readonly<{
  accessControl: ReturnType<typeof makeApiAccessControl>;
  identityModule: ReturnType<typeof makeIdentityModule>;
  controlBoundary: ReturnType<typeof makeControlBrowserBoundary>;
  controlExperience: ReturnType<typeof makeControlExperience>;
  locationAncestry: ReturnType<typeof makePostgresLocationAncestryAdapter>;
  orders: ReturnType<typeof makePostgresOrdersApplication>;
  pricingModule: ReturnType<typeof makePricingModule>;
  processorBoundary: ReturnType<typeof makeProcessorBrowserBoundary>;
  processorExperience: ReturnType<typeof makePostgresProcessorExperience>;
  productionModule: ReturnType<typeof makePostgresProductionModule>;
  users: ReturnType<typeof makePostgresUsersApplication>;
  webhookIngestion: ReturnType<typeof makePostgresWebhookIngestionApplication>;
}>;

export const makeApiCapabilities = (input: {
  runtime: ApiRuntime;
  clock: Clock;
  ids: IdSource;
}): ApiCapabilities => {
  const webhookIngestion = makePostgresWebhookIngestionApplication({
    db: input.runtime.database.db,
    clock: input.clock,
    ids: input.ids,
    quarantineRetentionMs:
      input.runtime.env.centsWebhook.quarantine.retentionMs,
  });

  const identityModule = makeIdentityModule({
    db: input.runtime.database.db,
    clock: input.clock,
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

  const authorizationModule = makeAuthorizationModule({
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

  const accessControl = makeApiAccessControl({
    authorization: authorizationModule,
    auth: identityModule.guards,
  });

  const processorExperience = makePostgresProcessorExperience({
    db: input.runtime.database.db,
    clock: input.clock,
    origins: {
      processor: input.runtime.env.processor.origin,
      control: input.runtime.env.control.origin,
    },
    productionCapabilities: {
      resolveForLocation: ({ session, location, now }) =>
        authorizationModule.productionCapabilitiesForLocation({
          principal: session.principal,
          principalAttributes: session.principalAttributes,
          locationId: location.id,
          businessId: location.businessId,
          now,
        }),
    },
  });

  const processorBoundary = makeProcessorBrowserBoundary({
    application: identityModule.application,
    resolveAccess: processorExperience.resolveAccess,
    bearerAuthenticate: identityModule.guards.authenticate,
    options: {
      origin: input.runtime.env.processor.origin,
      csrfSecret: revealSecret(input.runtime.env.processor.csrfSecret),
      secureCookies: input.runtime.env.nodeEnv === 'production',
    },
  });

  const pricingModule = makePricingModule({
    db: input.runtime.database.db,
    clock: input.clock,
    auth: accessControl.pricing,
  });

  const productionModule = makePostgresProductionModule({
    db: input.runtime.database.db,
    clock: input.clock,
    ids: input.ids,
    signals: makeProductionDomainSignals(input.runtime.observability.counters),
    security: {
      ...accessControl.production,
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

  const controlExperience = makeControlExperience({
    db: input.runtime.database.db,
    clock: input.clock,
    controlOrigin: input.runtime.env.control.origin,
    processorOrigin: input.runtime.env.processor.origin,
    customers: adaptControlCustomers(users),
    orders: adaptControlOrders(orders),
    workforce: adaptControlWorkforce(identityModule.application.workforce),
  });

  const controlBoundary = makeControlBrowserBoundary({
    application: identityModule.application,
    resolveAccess: (session) =>
      controlExperience.access({
        identityId: session.principal.identityId,
        assuranceLevel: session.principalAttributes.assuranceLevel,
      }),
    options: {
      origin: input.runtime.env.control.origin,
      csrfSecret: revealSecret(input.runtime.env.control.csrfSecret),
      processorOrigin: input.runtime.env.processor.origin,
      secureCookies: input.runtime.env.nodeEnv === 'production',
    },
  });

  return {
    accessControl,
    identityModule,
    controlBoundary,
    controlExperience,
    locationAncestry,
    orders,
    pricingModule,
    processorBoundary,
    processorExperience,
    productionModule,
    users,
    webhookIngestion,
  } as const;
};
