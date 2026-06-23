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
import type { ApiRuntime } from './common/runtime/runtime.ts';
import { makeHealthRoutes } from './routes/health.routes.ts';

export const makeApiApp = (runtime: ApiRuntime): express.Express => {
  const app = express();

  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({ origin: runtime.env.corsOrigin }));

  app.use(express.json({ limit: '1mb' }));

  app.use('/health', makeHealthRoutes(runtime));

  const authModule = makeAuthModule({
    db: runtime.database.db,
    tokenSecret: revealSecret(runtime.env.auth.secret),
    sessionTtlMinutes: runtime.env.auth.sessionTtlMinutes,
    loginWindowMinutes: runtime.env.auth.loginWindowMinutes,
    loginMaxFailures: runtime.env.auth.loginMaxFailures,
  });

  const accessControlModule = makeAccessControlModule({
    auth: authModule.guards,
    policies: {
      pricing: {
        freshSessionMaxAgeMinutes: runtime.env.auth.freshSessionMaxAgeMinutes,
      },
    },
  });

  const pricingModule = makePricingModule({
    db: runtime.database.db,
    auth: accessControlModule.pricing,
  });

  app.use('/auth', authModule.routes);
  app.use('/pricing', pricingModule.routes);

  app.use(makeNotFoundHandler());
  app.use(makeErrorHandler(runtime));

  return app;
};
