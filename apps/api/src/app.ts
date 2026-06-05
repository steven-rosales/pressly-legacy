/**
 * `app.ts` is to create composition of the routes, handlers, and runtimes.
 */

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { revealSecret } from '@pressly/config';
import { makeAppError } from '@pressly/errors';
import { makeAuthModule, type AuthLocals } from '@pressly/auth-module';
import { makePricingModule } from '@pressly/pricing';
import { makeErrorHandler } from './common/http/error-handler.ts';
import { makeNotFoundHandler } from './common/http/not-found.ts';
import type { ApiRuntime } from './common/runtime/runtime.ts';
import { makeHealthRoutes } from './routes/health.routes.ts';

const readAuthenticatedPricingChangeAuthor = (res: express.Response) => {
  const auth = res.locals['auth'] as AuthLocals | undefined;

  if (auth?.actor !== undefined)
    return {
      id: auth.actor.id,
      kind: auth.actor.kind,
      displayName: auth.actor.displayName,
    };

  throw makeAppError({
    kind: 'PermissionError',
    code: 'missing_auth_actor',
    message: 'Authenticated actor is missing from request locals.',
    safeMessage: 'Authentication is required.',
    status: 401,
  });
};

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

  const pricingModule = makePricingModule({
    db: runtime.database.db,
    auth: {
      authenticate: authModule.guards.authenticate,
      authorize: authModule.guards.authorize,
      readAuthor: readAuthenticatedPricingChangeAuthor,
      freshSessionMaxAgeMinutes: runtime.env.auth.freshSessionMaxAgeMinutes,
    },
  });

  app.use('/auth', authModule.routes);
  app.use('/pricing', pricingModule.routes);

  app.use(makeNotFoundHandler());
  app.use(makeErrorHandler(runtime));

  return app;
};
