import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configError } from '@pressly/errors/factories';
import { config as loadEnv } from 'dotenv';

export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);

export const presslyMigrationsDirectory = resolve(
  repositoryRoot,
  'platform/postgres/migrations',
);

export const loadPostgresToolingEnvironment = (): void => {
  loadEnv({
    path: [
      resolve(repositoryRoot, '.env.local'),
      resolve(repositoryRoot, '.env'),
    ],
    quiet: true,
  });
};

export const requirePostgresToolingDatabaseUrl = (input: {
  readonly code: string;
  readonly message: string;
}): string => {
  const databaseUrl = process.env['DATABASE_URL'];
  if (databaseUrl !== undefined && databaseUrl.trim() !== '')
    return databaseUrl;

  throw configError(input);
};
