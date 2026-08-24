import type { IdSource } from '@pressly/cells/id-source';
import { uuidIdSource } from '@pressly/cells/id-source/node';
import { makeEventStreamCatalogFromOwners } from '@pressly/generated/event-stream-catalog';
import { makeHttpCatalogFromOwners } from '@pressly/generated/http-catalog';
import {
  apiJsonDocument64kbProvider,
  apiJsonDocumentProvider,
  apiRawDocument256kbProvider,
  continueApiCatalogRequest,
  invokeApiCatalogMiddleware,
  makeHttpRuntimeApplication,
  makeIdentityRateLimiter,
  makeIpRateLimiter,
  makeMemoryRateLimitStore,
  makeRawBodyAuthentication,
  observeApiError,
} from '@pressly/http-host/runtime';
import type { ProductionChangeFeed } from '@pressly/production-system/operations/live/subscribe-changes/types';
import { systemClock, type Clock } from '@pressly/time';
import type { Request, Response } from 'express';
import { composeApiApplication } from '../../../../topology/runtime/http/bootstrap/app.ts';
import type { ApiHttpBoundaryMechanisms } from '../../../../topology/runtime/http/bootstrap/http-boundary-providers.ts';
import type { ApiRuntime } from '@pressly/topology/runtime/http';

export type ApiTestCompositionOverrides = Readonly<{
  centsWebhookVerifier?: Parameters<
    typeof composeApiApplication
  >[4]['centsWebhookVerifier'];
  clock?: Clock;
  ids?: IdSource;
  productionChanges?: ProductionChangeFeed;
}>;

export const apiTestMechanisms: ApiHttpBoundaryMechanisms<Request, Response> =
  Object.freeze({
    continueRequest: continueApiCatalogRequest,
    invokeMiddleware: invokeApiCatalogMiddleware,
    jsonDocument: apiJsonDocumentProvider,
    jsonDocument64kb: apiJsonDocument64kbProvider,
    rawDocument256kb: apiRawDocument256kbProvider,
    makeIpRateLimiter,
    makeIdentityRateLimiter,
    makeRawBodyAuthentication,
    observeError: observeApiError,
  });

export const makeApiApp = (
  runtime: ApiRuntime,
  overrides: ApiTestCompositionOverrides = {},
) =>
  makeHttpRuntimeApplication(
    composeApiApplication(
      runtime,
      {
        makeEventStreamCatalog: makeEventStreamCatalogFromOwners,
        makeHttpCatalog: makeHttpCatalogFromOwners,
      },
      makeMemoryRateLimitStore(),
      apiTestMechanisms,
      {
        clock: overrides.clock ?? systemClock,
        ids: overrides.ids ?? uuidIdSource,
        ...(overrides.centsWebhookVerifier === undefined
          ? {}
          : { centsWebhookVerifier: overrides.centsWebhookVerifier }),
        ...(overrides.productionChanges === undefined
          ? {}
          : { productionChanges: overrides.productionChanges }),
      },
    ),
  );
