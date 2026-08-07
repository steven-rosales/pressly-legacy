import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { revealSecret } from '@pressly/config';
import type { IdSource } from '@pressly/kernel';
import { uuidIdSource } from '@pressly/kernel/node';
import {
  attemptObservation,
  nullMeasurementSink,
} from '@pressly/observability';
import { systemClock, type Clock } from '@pressly/time';
import { makeErrorHandler } from '../http/middleware/error.middleware.ts';
import { makeNotFoundHandler } from '../http/middleware/not-found.middleware.ts';
import { makeRequestContext } from '../http/middleware/request-context.middleware.ts';
import type { ProductionChangeFeed } from '../http/production/live/postgres-production-change-feed.adapter.ts';
import { makeApiRequestMetrics } from '../http/middleware/api-metrics.middleware.ts';
import { makeProductionSignals } from '../http/middleware/production-signals.middleware.ts';
import type { ApiRuntime } from '../runtime/api-runtime.ts';
import { makeCorsOptions } from '../http/middleware/cors.middleware.ts';
import {
  acceptUnsignedCentsWebhook,
  makeCentsWebhookHmacVerifier,
  type CentsWebhookVerifier,
} from '../http/webhooks/cents/cents-webhook.verifier.ts';
import { makeCentsWebhookRoute } from '../http/webhooks/cents/cents-webhook.route.ts';
import { makeCentsWebhookPayloadCipher } from '../http/webhooks/cents/cents-webhook.quarantine.ts';
import {
  makeIpRateLimiter,
  makeIdentityRateLimiter,
  makeMemoryRateLimitStore,
} from '../http/middleware/rate-limit.middleware.ts';
import { requireJsonContentType } from '@pressly/http/express';
import { makeHealthRoutes } from '../http/system/health/health.route.ts';
import { makeWebhookIngestionRoutes } from '../http/webhook-ingestion/dead-letters/dead-letter.route.ts';
import { makeProductionChangeRoutes } from '../http/production/live/production-change.route.ts';
import { makeOrderManagementRoutes } from '../http/order-management/order-management.route.ts';
import { makeProcessorOrderControlRoutes } from '../http/processor/order-control/order-control.route.ts';
import { makeProcessorOrderControlAdapter } from '../http/processor/order-control/order-control.adapter.ts';
import { makeProcessorOperationalOrderIdentityAdapter } from '../http/processor/operational-order-identity/operational-order-identity.adapter.ts';
import { makeProcessorOperationalOrderRoutes } from '../http/processor/operational-order-identity/operational-order-identity.route.ts';
import { makeApiCapabilities } from './api-capabilities.composition.ts';
import { makeControlWorkforceRoutes } from '../http/control/workforce/control-workforce.route.ts';
import { makeControlInvitationAcceptanceRoutes } from '../http/control/workforce/control-invitation.route.ts';
import { makeControlSecurityRoutes } from '../http/control/security/control-security.route.ts';
import { makeControlCustomerRoutes } from '../http/control/data/control-customer.route.ts';
import { makeControlOrderRoutes } from '../http/control/data/control-order.route.ts';

export type ApiCompositionOverrides = Readonly<{
  centsWebhookVerifier?: CentsWebhookVerifier;
  clock?: Clock;
  ids?: IdSource;
  productionChanges?: ProductionChangeFeed;
}>;

export const makeApiApp = (
  runtime: ApiRuntime,
  overrides: ApiCompositionOverrides = {},
): express.Express => {
  const app = express();
  const rateLimitStore = makeMemoryRateLimitStore();
  const clock = overrides.clock ?? systemClock;
  const ids = overrides.ids ?? uuidIdSource;

  const controlIdentityRateLimit = makeIdentityRateLimiter({
    name: 'control_identity',
    ...runtime.env.rateLimits.controlMutation,
    store: rateLimitStore,
    logger: runtime.logger,
    securityEvents: runtime.securityEvents,
  });

  const {
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
    webhookIngestion,
  } = makeApiCapabilities({
    runtime,
    clock,
    ids,
  });

  const operationalOrderAdapter = makeProcessorOperationalOrderIdentityAdapter(
    processorExperience.operationalOrderIdentities,
  );

  const orderControlAdapter = makeProcessorOrderControlAdapter(
    processorExperience.loadOperationalOrderControlContexts,
  );

  const centsWebhookPayloadCipher =
    runtime.env.centsWebhook.quarantine.encryptionKey === undefined
      ? undefined
      : makeCentsWebhookPayloadCipher(
          revealSecret(runtime.env.centsWebhook.quarantine.encryptionKey),
        );

  const configuredCentsWebhookVerifier =
    runtime.env.centsWebhook.authMode === 'unsigned'
      ? acceptUnsignedCentsWebhook
      : makeCentsWebhookHmacVerifier({
          ...(runtime.env.centsWebhook.hmac.currentKey === undefined
            ? {}
            : {
                currentKey: revealSecret(
                  runtime.env.centsWebhook.hmac.currentKey,
                ),
              }),
          ...(runtime.env.centsWebhook.hmac.previousKey === undefined
            ? {}
            : {
                previousKey: revealSecret(
                  runtime.env.centsWebhook.hmac.previousKey,
                ),
              }),
          clock,
          clockWindowSeconds: runtime.env.centsWebhook.hmac.clockWindowSeconds,
        });

  if (
    overrides.centsWebhookVerifier === undefined &&
    runtime.env.centsWebhook.authMode === 'unsigned'
  )
    attemptObservation(() =>
      runtime.logger.warn(
        'Cents webhook authentication is disabled by configuration.',
        { route: '/webhooks/cents', authMode: 'unsigned' },
      ),
    );

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors(makeCorsOptions(runtime.env.corsOrigin, runtime.env.nodeEnv)));
  app.use(makeRequestContext());
  app.use(
    makeApiRequestMetrics({
      counters: runtime.observability.counters,
      measurements: runtime.observability.measurements ?? nullMeasurementSink,
    }),
  );
  app.use(makeProductionSignals(runtime.observability.counters));

  app.use('/health', makeHealthRoutes(runtime));

  app.use(
    makeIpRateLimiter({
      name: 'api_global',
      ...runtime.env.rateLimits.global,
      store: rateLimitStore,
      logger: runtime.logger,
      securityEvents: runtime.securityEvents,
    }),
  );

  app.use(
    '/auth/login',
    makeIpRateLimiter({
      name: 'auth_login',
      ...runtime.env.rateLimits.login,
      store: rateLimitStore,
      logger: runtime.logger,
      securityEvents: runtime.securityEvents,
    }),
    requireJsonContentType(),
    express.json({ limit: '8kb' }),
  );

  app.use(
    '/processor/auth/login',
    makeIpRateLimiter({
      name: 'processor_auth_login',
      ...runtime.env.rateLimits.login,
      store: rateLimitStore,
      logger: runtime.logger,
      securityEvents: runtime.securityEvents,
    }),
    requireJsonContentType(),
    express.json({ limit: '8kb' }),
  );

  app.use(
    '/processor/auth/mfa/challenge',
    requireJsonContentType(),
    express.json({ limit: '4kb' }),
  );

  app.use(
    '/control/auth/login',
    makeIpRateLimiter({
      name: 'control_auth_login',
      ...runtime.env.rateLimits.login,
      store: rateLimitStore,
      logger: runtime.logger,
      securityEvents: runtime.securityEvents,
    }),
    requireJsonContentType(),
    express.json({ limit: '8kb' }),
  );

  app.use(
    '/control/auth/mfa/challenge',
    requireJsonContentType(),
    express.json({ limit: '4kb' }),
  );

  app.use(
    [
      '/control/invitations/preview',
      '/control/invitations/accept/new',
      '/control/invitations/accept/existing',
      '/control/invitations/accept/existing/password',
      '/control/invitations/accept/existing/mfa',
    ],
    makeIpRateLimiter({
      name: 'control_invitation_accept',
      ...runtime.env.rateLimits.invitationAccept,
      store: rateLimitStore,
      logger: runtime.logger,
      securityEvents: runtime.securityEvents,
    }),
    requireJsonContentType(),
    express.json({ limit: '8kb' }),
  );

  app.use(
    '/control',
    makeIpRateLimiter({
      name: 'control_boundary',
      ...runtime.env.rateLimits.controlMutation,
      store: rateLimitStore,
      logger: runtime.logger,
      securityEvents: runtime.securityEvents,
    }),
    express.json({ limit: '16kb' }),
  );

  app.use(
    '/pricing/changes',
    requireJsonContentType(),
    express.json({ limit: '16kb' }),
  );

  app.use(
    ['/auth/mfa/challenge', '/auth/mfa/enrollment/confirm'],
    requireJsonContentType(),
    express.json({ limit: '4kb' }),
  );

  app.use(
    '/webhooks/cents',
    makeCentsWebhookRoute({
      verifier:
        overrides.centsWebhookVerifier ?? configuredCentsWebhookVerifier,
      ingestEvent: webhookIngestion.ingestEvent,
      ...(centsWebhookPayloadCipher === undefined
        ? {}
        : {
            quarantine: {
              captureReceipt: webhookIngestion.captureReceipt,
              linkReceipt: webhookIngestion.linkReceipt,
              payloadCipher: centsWebhookPayloadCipher,
            },
          }),
    }),
  );

  app.use(
    '/control',
    makeControlCustomerRoutes({
      application: controlExperience.customers,
      authenticate: controlBoundary.authenticate,
      limitIdentity: controlIdentityRateLimit,
      requireRead: controlBoundary.requireCapability('customers:read'),
      requireWrite: controlBoundary.requireCapability('customers:write'),
    }),
  );

  app.use(
    '/control',
    makeControlOrderRoutes({
      application: controlExperience.orders,
      authenticate: controlBoundary.authenticate,
      limitIdentity: controlIdentityRateLimit,
      requireRead: controlBoundary.requireCapability('orders:read'),
      requireWrite: controlBoundary.requireCapability('orders:write'),
    }),
  );

  app.use(express.json({ limit: '64kb' }));

  app.use('/auth', identityModule.routes);

  app.use('/processor/auth', processorBoundary.routes);

  app.use('/control/auth', controlBoundary.routes);

  app.use(
    '/control/invitations',
    makeControlInvitationAcceptanceRoutes({
      application: controlExperience.invitations,
      authApplication: identityModule.application,
      authenticateExisting: controlBoundary.authenticate,
      limitExistingIdentity: controlIdentityRateLimit,
      requireOrigin: controlBoundary.requireOrigin,
      names: controlBoundary.invitationBootstrap.names,
      sessionOptions: controlBoundary.invitationBootstrap.options,
      resolveAccess: controlBoundary.invitationBootstrap.resolveAccess,
    }),
  );

  app.use(
    '/control',
    makeControlWorkforceRoutes({
      application: controlExperience,
      authenticate: controlBoundary.authenticate,
      limitIdentity: controlIdentityRateLimit,
      requireRead: controlBoundary.requireCapability('team:read'),
      requireWrite: controlBoundary.requireCapability('team:write'),
    }),
  );

  app.use(
    '/control',
    makeControlSecurityRoutes({
      application: controlExperience.security,
      authenticate: controlBoundary.authenticate,
      limitIdentity: controlIdentityRateLimit,
      requireRead: controlBoundary.requireCapability('security:read'),
    }),
  );

  app.use(
    '/auth',
    identityModule.makeAdministrationRoutes({
      sessions: accessControl.authSessions,
      mfa: accessControl.mfa,
    }),
  );

  app.use(
    '/control/auth',
    identityModule.makeAdministrationRoutes({
      sessions: {
        ...accessControl.authSessions,
        authenticate: controlBoundary.authenticate,
      },
      mfa: {
        ...accessControl.mfa,
        authenticate: controlBoundary.authenticate,
      },
    }),
  );

  app.use('/pricing', pricingModule.routes);

  app.use(
    makeWebhookIngestionRoutes({
      application: webhookIngestion,
      authenticate: processorBoundary.authenticate,
      authorize: accessControl.production.resources,
    }),
  );

  if (overrides.productionChanges !== undefined)
    app.use(
      makeProductionChangeRoutes({
        feed: overrides.productionChanges,
        authenticate: processorBoundary.authenticate,
        authorize: accessControl.production.read,
        counters: runtime.observability.counters,
        measurements: runtime.observability.measurements ?? nullMeasurementSink,
      }),
    );

  app.use(
    makeOrderManagementRoutes({
      orders,
      authenticate: processorBoundary.authenticate,
      authorizeOrders: accessControl.orderManagement.writeOrders,
      readPrincipal: identityModule.guards.readPrincipal,
      resolveBusinessId: locationAncestry.resolveBusinessId,
    }),
  );

  app.use(
    makeProcessorOrderControlRoutes({
      production: productionModule.application,
      orderControlAdapter,
      authenticate: processorBoundary.authenticate,
      authorize: accessControl.production.read,
    }),
  );

  app.use(
    makeProcessorOperationalOrderRoutes({
      production: productionModule.application,
      operationalOrderAdapter,
      authenticate: processorBoundary.authenticate,
      authorizeRead: accessControl.production.read,
      authorizeOverride: accessControl.production.override,
    }),
  );

  app.use(productionModule.routes);

  app.use(makeNotFoundHandler());
  app.use(makeErrorHandler(runtime));

  return app;
};
