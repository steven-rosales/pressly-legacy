import {
  composePresslyHttpRuntime,
  parseApiEnv,
  type PresslyHttpRuntimeAssembly,
  type PresslyHttpRuntimeInput,
} from './runtime/http/public.js';
import {
  makeEventStreamCatalogFromOwners,
  makeHttpCatalogFromOwners,
  httpRouteManifest,
} from './runtime/http/catalog.js';
import type {
  ApiBoundaryRequest,
  ApiBoundaryResponse,
} from './runtime/http/public.js';

export const parseHttpRuntimeConfiguration = (environment: NodeJS.ProcessEnv) =>
  parseApiEnv(environment);

export const composeHttpRuntime = <
  Request extends ApiBoundaryRequest,
  Response extends ApiBoundaryResponse,
>(
  input: Omit<PresslyHttpRuntimeInput<Request, Response>, 'catalogs'>,
): PresslyHttpRuntimeAssembly<Request, Response> =>
  composePresslyHttpRuntime({
    ...input,
    catalogs: {
      makeEventStreamCatalog: makeEventStreamCatalogFromOwners,
      makeHttpCatalog: makeHttpCatalogFromOwners,
    },
  });

export { httpRouteManifest };
export {
  httpBoundaryProviderTokens,
  makeEventStreamCatalogFromOwners,
  makeHttpCatalogFromOwners,
} from './runtime/http/catalog.js';
export { createPresslyDatabase } from './database.js';
