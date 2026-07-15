/**
 * `app.ts` is to create composition of the routes, handlers, and runtimes.
 */

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { makeAccessControlModule } from '@pressly/access-control';
import { revealSecret } from '@pressly/config';
import { makeAuthModule } from '@pressly/auth-module';
import { makePricingModule } from '@pressly/pricing';
import { makePostgresProductionModule } from '@pressly/production';
import { makeProductionPolicy } from '@pressly/production-policy';
import { makeProductionScheduler } from '@pressly/production-scheduling';
import { makePostgresWebhookIngestionApplication } from '@pressly/webhook-ingestion';
import { nullMeasurementSink } from '@pressly/metrics';
import { makeErrorHandler } from './common/http/error-handler.ts';
import { makeNotFoundHandler } from './common/http/not-found.ts';
import { makeRequestContext } from './common/http/request-context.ts';
import type { ProductionChangeFeed } from './common/live/production-change-feed.ts';
import { makeApiRequestMetrics } from './common/observability/api-metrics.ts';
import {
  makeProductionDomainSignals,
  makeProductionSignals,
} from './common/observability/production-signals.ts';
import type { ApiRuntime } from './common/runtime/runtime.ts';
import { makeCorsOptions } from './common/security/cors.ts';
import {
  makeCentsWebhookHmacVerifier,
  type CentsWebhookVerifier,
} from './vendors/cents/cents-webhook.security.ts';
import { makeCentsWebhookRoute } from './vendors/cents/cents-webhook.route.ts';
import { makeProcessorBrowserBoundary } from './common/security/processor-session.ts';
import {
  makeIpRateLimiter,
  makeMemoryRateLimitStore,
} from './common/security/rate-limit.ts';
import { requireJsonContentType } from '@pressly/http/express';
import { makeHealthRoutes } from './routes/health.routes.ts';
import { makeWebhookIngestionRoutes } from './routes/webhook-ingestion.routes.ts';
import { makeProductionChangeRoutes } from './routes/production-change.routes.ts';

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
  const webhookIngestion = makePostgresWebhookIngestionApplication({
    db: runtime.database.db,
    clock,
    ids,
  });

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
        overrides.centsWebhookVerifier ??
        makeCentsWebhookHmacVerifier({
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
        }),
      ingestEvent: webhookIngestion.ingestEvent,
    }),
  );

  app.use(express.json({ limit: '64kb' }));

  const authModule = makeAuthModule({
    db: runtime.database.db,
    tokenSecret: revealSecret(runtime.env.auth.secret),
    sessionTtlMinutes: runtime.env.auth.sessionTtlMinutes,
    sessionIdleTimeoutMinutes: runtime.env.auth.sessionIdleTimeoutMinutes,
    loginWindowMinutes: runtime.env.auth.loginWindowMinutes,
    loginMaxFailures: runtime.env.auth.loginMaxFailures,
    mfaChallengeTtlMinutes: runtime.env.auth.mfaChallengeTtlMinutes,
    securityEvents: runtime.securityEvents,
    mfaEncryptionKey: revealSecret(runtime.env.auth.mfaEncryptionKey),
    mfaIssuer: runtime.env.auth.mfaIssuer,
  });

  const accessControlModule = makeAccessControlModule({
    auth: authModule.guards,
    policies: {
      pricing: {
        freshSessionMaxAgeMinutes: runtime.env.auth.freshSessionMaxAgeMinutes,
      },
      authSessions: {
        freshSessionMaxAgeMinutes: runtime.env.auth.freshSessionMaxAgeMinutes,
      },
      mfa: {
        freshSessionMaxAgeMinutes: runtime.env.auth.freshSessionMaxAgeMinutes,
      },
    },
  });

  const processorBoundary = makeProcessorBrowserBoundary({
    application: authModule.application,
    bearerAuthenticate: authModule.guards.authenticate,
    options: {
      origin: runtime.env.processor.origin,
      csrfSecret: revealSecret(runtime.env.processor.csrfSecret),
      secureCookies: runtime.env.nodeEnv === 'production',
    },
  });

  const pricingModule = makePricingModule({
    db: runtime.database.db,
    auth: accessControlModule.pricing,
  });

  const productionPolicy = makeProductionPolicy();
  const productionScheduler = makeProductionScheduler();
  const productionModule = makePostgresProductionModule({
    db: runtime.database.db,
    policy: productionPolicy,
    scheduler: productionScheduler,
    clock,
    ids,
    signals: makeProductionDomainSignals(runtime.observability.counters),
    security: {
      ...accessControlModule.production,
      authenticate: processorBoundary.authenticate,
    },
  });

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

  app.use(productionModule.routes);

  app.use(makeNotFoundHandler());
  app.use(makeErrorHandler(runtime));

  return app;
};
