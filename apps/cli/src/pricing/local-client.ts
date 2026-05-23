import { resolveCliActor } from '@pressly/auth';
import { createDatabaseRuntime } from '@pressly/db';
import {
  err,
  normalizeUnknownError,
  ok,
  validationError,
  type AppError,
  type Result,
} from '@pressly/errors';
import { makePricingModule } from '@pressly/pricing';
import type { PricingAdminClient } from './client.ts';
import { toPublishPricingChangeCommand } from './command.ts';

export type PricingCliEnv = NodeJS.ProcessEnv;

const readDatabaseUrl = (env: PricingCliEnv): Result<string, AppError> => {
  const adminDatabaseUrl = env['PRESSLY_ADMIN_DATABASE_URL'];

  if (adminDatabaseUrl !== undefined && adminDatabaseUrl.trim() !== '')
    return ok(adminDatabaseUrl);

  const databaseUrl = env['DATABASE_URL'];

  if (databaseUrl !== undefined && databaseUrl.trim() !== '')
    return ok(databaseUrl);

  return err(
    validationError({
      code: 'missing_database_url',
      message:
        'PRESSLY_ADMIN_DATABASE_URL or DATABASE_URL is required for the local admin CLI adapter.',
      safeMessage: 'Admin database URL is required.',
      details: { keys: ['PRESSLY_ADMIN_DATABASE_URL', 'DATABASE_URL'] },
    }),
  );
};

export const makeLocalPricingAdminClient = (
  env: PricingCliEnv,
): Result<PricingAdminClient, AppError> => {
  const databaseUrl = readDatabaseUrl(env);

  if (!databaseUrl.ok) return databaseUrl;

  const database = createDatabaseRuntime({
    databaseUrl: databaseUrl.value,
    maxConnections: 1,
  });
  const pricing = makePricingModule({ db: database.db });

  const withActor = (
    input: Parameters<PricingAdminClient['planChange']>[0],
  ) => {
    try {
      return ok(toPublishPricingChangeCommand(input, resolveCliActor(env)));
    } catch (error) {
      return err(normalizeUnknownError(error));
    }
  };

  return ok({
    loadCatalog: pricing.admin.loadCatalog,
    planChange: async (input) => {
      const command = withActor(input);

      if (!command.ok) return command;

      return pricing.admin.planChange(command.value);
    },
    publishChange: async (input) => {
      const command = withActor(input);

      if (!command.ok) return command;

      return pricing.admin.publishChange(command.value);
    },
    close: () => database.close(),
  });
};
