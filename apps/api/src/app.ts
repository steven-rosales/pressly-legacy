/**
 * `app.ts` is to create composition of the routes, handlers, and runtimes.
 */

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { makeAccessControlModule } from '@pressly/access-control';
import { revealSecret } from '@pressly/config';
import { makeAuthModule } from '@pressly/auth-module';
import { makePricingModule } from '@pressly/pricing';
import { makeErrorHandler } from './common/http/error-handler.ts';
import { makeNotFoundHandler } from './common/http/not-found.ts';
import { makeRequestContext } from './common/http/request-context.ts';
import type { ApiRuntime } from './common/runtime/runtime.ts';
import { makeCorsOptions } from './common/security/cors.ts';
import {
  makeIpRateLimiter,
  makeMemoryRateLimitStore,
} from './common/security/rate-limit.ts';
import { requireJsonContentType } from '@pressly/http/express';
import { makeHealthRoutes } from './routes/health.routes.ts';

export const makeApiApp = (runtime: ApiRuntime): express.Express => {
  const app = express();
  const rateLimitStore = makeMemoryRateLimitStore();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors(makeCorsOptions(runtime.env.corsOrigin, runtime.env.nodeEnv)));
  app.use(makeRequestContext(runtime.logger));

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
    '/pricing/changes',
    requireJsonContentType(),
    express.json({ limit: '16kb' }),
  );

  app.use(
    ['/auth/mfa/challenge', '/auth/mfa/enrollment/confirm'],
    requireJsonContentType(),
    express.json({ limit: '4kb' }),
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

  const pricingModule = makePricingModule({
    db: runtime.database.db,
    auth: accessControlModule.pricing,
  });

  app.use('/auth', authModule.routes);

  app.use(
    '/auth',
    authModule.makeAdministrationRoutes({
      sessions: accessControlModule.authSessions,
      mfa: accessControlModule.mfa,
    }),
  );

  app.use('/pricing', pricingModule.routes);

  app.use(makeNotFoundHandler());
  app.use(makeErrorHandler(runtime));

  return app;
};
