/* This file is generated from the checked deployment topology. */
import { makeEventStreamCatalogFromOwners } from '@pressly/generated/event-stream-catalog';
import { makeHttpCatalogFromOwners } from '@pressly/generated/http-catalog';
import { createPostgresRuntime } from '@pressly/postgres/client';
import {
  composePresslyHttpRuntime,
  parseApiEnv,
  type ApiBoundaryRequest,
  type ApiBoundaryResponse,
  type PresslyHttpRuntimeAssembly,
  type PresslyHttpRuntimeInput,
} from '@pressly/topology/runtime/http';
import { presslyPostgresSchema } from '@pressly/topology/postgres-schema';

export const parseHttpRuntimeConfiguration = (environment: NodeJS.ProcessEnv) =>
  parseApiEnv(environment);

export const createHttpDatabase = (input: {
  databaseUrl: string;
  maxConnections: number;
}) =>
  createPostgresRuntime({
    databaseUrl: input.databaseUrl,
    schema: presslyPostgresSchema,
    maxConnections: input.maxConnections,
    connectTimeoutSeconds: 5,
    idleTimeoutSeconds: 30,
    maxLifetimeSeconds: 60 * 30,
  });

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
