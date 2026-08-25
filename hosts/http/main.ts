import {
  composeHttpRuntime,
  createHttpDatabase,
  parseHttpRuntimeConfiguration,
} from '@pressly/generated-runtime/http';
import { uuidIdSource } from '@pressly/cells/id-source/node';
import { systemClock } from '@pressly/time';
import type { Request, Response } from 'express';
import {
  makeHttpProcessRuntime,
  makeMemoryRateLimitStore,
  makeIdentityRateLimiter,
  makeIpRateLimiter,
  makeRawBodyAuthentication,
  makeSecurityEventSink,
  observeApiError,
  apiJsonDocument64kbProvider,
  apiJsonDocumentProvider,
  apiRawDocument256kbProvider,
  continueApiCatalogRequest,
  invokeApiCatalogMiddleware,
  readHttpProcessEnvironment,
  runHttpProcess,
} from './src/runtime/public.ts';

const configuration = parseHttpRuntimeConfiguration(
  readHttpProcessEnvironment(),
);
const processRuntime = makeHttpProcessRuntime(configuration);
const database = createHttpDatabase({
  databaseUrl: configuration.databaseUrl,
  maxConnections: configuration.databaseMaxConnections ?? 100,
});
const securityEvents = makeSecurityEventSink({
  alerts: processRuntime.errors,
  counters: processRuntime.signals.counters,
});
const assembly = composeHttpRuntime<Request, Response>({
  configuration,
  database,
  clock: systemClock,
  ids: uuidIdSource,
  rateLimitStore: makeMemoryRateLimitStore(),
  mechanisms: {
    continueRequest: continueApiCatalogRequest,
    invokeMiddleware: invokeApiCatalogMiddleware,
    jsonDocument: apiJsonDocumentProvider,
    jsonDocument64kb: apiJsonDocument64kbProvider,
    rawDocument256kb: apiRawDocument256kbProvider,
    makeIpRateLimiter,
    makeIdentityRateLimiter,
    makeRawBodyAuthentication,
    observeError: observeApiError,
  },
  process: {
    logger: processRuntime.logger,
    errors: processRuntime.errors,
    counters: processRuntime.signals.counters,
    measurements: processRuntime.signals.measurements,
    trace: processRuntime.trace,
    securityEvents,
    nowNanoseconds: processRuntime.nowNanoseconds,
  },
});

void runHttpProcess({
  assembly,
  process: processRuntime,
  closeDatabase: () => database.close(),
});
