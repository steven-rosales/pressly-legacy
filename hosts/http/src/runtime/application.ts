import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { nullMeasurementSink } from '@pressly/observability';
import type { ExecutableHttpCatalog } from '@pressly/cells';
import { mountHttpBoundaryCatalog } from '../public.ts';
import {
  assertApiHttpBoundaryProviderCoverage,
  makeApiHttpBoundaryHostDependencies,
  makeApiHttpBoundaryProviderRegistry,
  type ApiHttpBoundaryProviderRegistryDependencies,
} from './boundary-provider-registry.ts';
import { makeApiEventStreamCatalogRouter } from './event-stream-catalog.ts';
import { makeCorsOptions } from './middleware/cors.ts';
import {
  makeErrorHandler,
  type HttpBoundaryErrorObservation,
} from './middleware/error.ts';
import { makeApiRequestMetrics } from './middleware/metrics.ts';
import { makeNotFoundHandler } from './middleware/not-found.ts';
import {
  makeIpRateLimiter,
  type RateLimitStore,
} from './middleware/rate-limit.ts';
import { makeRequestContext } from './middleware/request-context.ts';
import { makeHealthRoutes } from './system/health.ts';
import type { HttpBoundaryRuntime } from './types.ts';

export type HttpRuntimeApplicationAssembly = Readonly<{
  runtime: HttpBoundaryRuntime &
    Readonly<{
      database: Parameters<typeof makeHealthRoutes>[0]['database'];
    }>;
  configuration: Readonly<{
    nodeEnv: 'development' | 'production' | 'test';
    corsOrigin: string;
    globalRateLimit: Readonly<{ limit: number; windowMs: number }>;
  }>;
  httpCatalog: ExecutableHttpCatalog;
  boundaryProviders: ApiHttpBoundaryProviderRegistryDependencies;
  rateLimitStore: RateLimitStore;
  eventStream: Parameters<typeof makeApiEventStreamCatalogRouter>[0] | null;
  observeBoundaryError?: (input: HttpBoundaryErrorObservation) => void;
  observeResponse?: (input: {
    operation: Parameters<
      ReturnType<typeof makeApiHttpBoundaryHostDependencies>['requestContext']
    >[0];
    status: number;
  }) => void;
}>;

export const makeHttpRuntimeApplication = (
  assembly: HttpRuntimeApplicationAssembly,
): express.Express => {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors(
      makeCorsOptions(
        assembly.configuration.corsOrigin,
        assembly.configuration.nodeEnv,
      ),
    ),
  );
  app.use(makeRequestContext());
  app.use(
    makeApiRequestMetrics({
      counters: assembly.runtime.observability.counters,
      measurements:
        assembly.runtime.observability.measurements ?? nullMeasurementSink,
    }),
  );
  app.use('/health', makeHealthRoutes(assembly.runtime));
  app.use(
    makeIpRateLimiter({
      name: 'api_global',
      ...assembly.configuration.globalRateLimit,
      store: assembly.rateLimitStore,
      logger: assembly.runtime.logger,
      securityEvents: assembly.runtime.securityEvents,
    }),
  );

  const registry = makeApiHttpBoundaryProviderRegistry(
    assembly.boundaryProviders,
  );
  assertApiHttpBoundaryProviderCoverage(assembly.httpCatalog, registry);
  mountHttpBoundaryCatalog({
    router: app,
    catalog: assembly.httpCatalog,
    dependencies: {
      ...makeApiHttpBoundaryHostDependencies(registry),
      ...(assembly.observeResponse === undefined
        ? {}
        : { observeResponse: assembly.observeResponse }),
    },
  });
  if (assembly.eventStream !== null)
    app.use(makeApiEventStreamCatalogRouter(assembly.eventStream));

  app.use(makeNotFoundHandler());
  app.use(
    makeErrorHandler(assembly.runtime, {
      ...(assembly.observeBoundaryError === undefined
        ? {}
        : { observe: assembly.observeBoundaryError }),
    }),
  );
  return app;
};
