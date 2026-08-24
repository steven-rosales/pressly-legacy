/* This file is generated from the checked deployment topology. */
import { makeCliCatalogFromOwners } from '@pressly/generated/cli-catalog';
import { createPostgresRuntime } from '@pressly/postgres/client';
import {
  composePresslyCliRuntime,
  resolvePresslyCliRuntimeInvocation,
} from '@pressly/topology/runtime/cli';
import { presslyPostgresSchema } from '@pressly/topology/postgres-schema';

export const resolveCliRuntimeInvocation = (argv: readonly string[]) =>
  resolvePresslyCliRuntimeInvocation(argv);

export const composeCliRuntime = (
  input: Parameters<typeof composePresslyCliRuntime>[0],
) => composePresslyCliRuntime(input, makeCliCatalogFromOwners);

export const createCliDatabase = (input: {
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
