import { createPostgresRuntime } from '@pressly/postgres/client';
import { presslyPostgresSchema } from './pressly-postgres-schema.js';

export const createPresslyDatabase = (input: {
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
