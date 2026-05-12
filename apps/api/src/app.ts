import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
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

  const pricingModule = makePricingModule({ db: runtime.database.db });

  app.use('/pricing', pricingModule.routes);

  app.use(makeNotFoundHandler());
  app.use(makeErrorHandler(runtime));

  return app;
};
