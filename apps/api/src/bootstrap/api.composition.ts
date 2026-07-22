/**
 * `app.ts` is to create composition of the routes, handlers, and runtimes.
 */

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { revealSecret } from '@pressly/config';
import { nullMeasurementSink } from '@pressly/metrics';
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
  makeMemoryRateLimitStore,
} from '../http/middleware/rate-limit.middleware.ts';
import { requireJsonContentType } from '@pressly/http/express';
import { makeHealthRoutes } from '../http/system/health/health.route.ts';
import { makeWebhookIngestionRoutes } from '../http/webhook-ingestion/dead-letters/dead-letter.route.ts';
import { makeProductionChangeRoutes } from '../http/production/live/production-change.route.ts';
import { makeOrderManagementRoutes } from '../http/order-management/order-management.route.ts';
import { makeProcessorOrderControlRoutes } from '../http/processor/order-control/order-control.route.ts';
import { makeProcessorOrderControlReadModel } from '../http/processor/order-control/order-control.query.ts';
import { makeApiCapabilities } from './api-capabilities.composition.ts';

export type ApiCompositionOverrides = Readonly<{
  centsWebhookVerifier?: CentsWebhookVerifier;
  clock?: Readonly<{ now: () => Date }>;
  ids?: Readonly<{ next: () => string }>;
  productionChanges?: ProductionChangeFeed;
}>;

export const makeApiApp = (
  runtime: ApiRuntime,
  overrides: ApiCompositionOverrides = {},
): express.Express => {
  const app = express();
  const rateLimitStore = makeMemoryRateLimitStore();
  const clock = overrides.clock ?? { now: () => new Date() };
  const ids = overrides.ids ?? { next: () => randomUUID() };
  const {
    accessControlModule,
    authModule,
    orders,
    pricingModule,
    processorBoundary,
    productionModule,
    users,
    webhookIngestion,
  } = makeApiCapabilities({
    runtime,
    clock,
    ids,
  });
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
    runtime.logger.warn(
      'Cents webhook authentication is disabled by configuration.',
      { route: '/webhooks/cents', authMode: 'unsigned' },
    );

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors(makeCorsOptions(runtime.env.corsOrigin, runtime.env.nodeEnv)));
  app.use(makeRequestContext(runtime.logger));
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

  app.use(express.json({ limit: '64kb' }));

  app.use('/auth', authModule.routes);

  app.use('/processor/auth', processorBoundary.routes);

  app.use(
    '/auth',
    authModule.makeAdministrationRoutes({
      sessions: accessControlModule.authSessions,
      mfa: accessControlModule.mfa,
    }),
  );

  app.use('/pricing', pricingModule.routes);

  app.use(
    makeWebhookIngestionRoutes({
      application: webhookIngestion,
      authenticate: processorBoundary.authenticate,
      authorize: accessControlModule.production.resources,
    }),
  );

  if (overrides.productionChanges !== undefined)
    app.use(
      makeProductionChangeRoutes({
        feed: overrides.productionChanges,
        authenticate: processorBoundary.authenticate,
        authorize: accessControlModule.production.read,
        counters: runtime.observability.counters,
        measurements: runtime.observability.measurements ?? nullMeasurementSink,
      }),
    );

  app.use(
    makeOrderManagementRoutes({
      users,
      orders,
      authenticate: processorBoundary.authenticate,
      authorizeUsers: accessControlModule.orderManagement.writeUsers,
      authorizeOrders: accessControlModule.orderManagement.writeOrders,
      readPrincipal: authModule.guards.readPrincipal,
    }),
  );

  app.use(
    makeProcessorOrderControlRoutes({
      production: productionModule.application,
      readModel: makeProcessorOrderControlReadModel(runtime.database.db),
      authenticate: processorBoundary.authenticate,
      authorize: accessControlModule.production.read,
    }),
  );

  app.use(productionModule.routes);

  app.use(makeNotFoundHandler());
  app.use(makeErrorHandler(runtime));

  return app;
};
