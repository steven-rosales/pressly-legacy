import { resolveCliActor } from '@pressly/auth';
import type { PublishPricingChangeCommand } from '@pressly/contracts';
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
import {
  parsePricingCliCommand,
  usage,
  type PricingCliCommand,
} from './args.ts';
import {
  renderAppError,
  renderPricingCatalog,
  renderPricingPlan,
  renderPricingPublishResult,
} from './render.ts';

type CliWriter = Pick<NodeJS.WriteStream, 'write'>;

export type PricingCliIO = Readonly<{
  stdout: CliWriter;
  stderr: CliWriter;
}>;

export type PricingCliEnv = NodeJS.ProcessEnv;

const commandError = (message: string, details?: unknown): AppError =>
  validationError({
    code: 'invalid_cli_command',
    message,
    safeMessage: message,
    ...(details === undefined ? {} : { details }),
  });

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
        'PRESSLY_ADMIN_DATABASE_URL or DATABASE_URL is required for the admin CLI.',
      safeMessage: 'Admin database URL is required.',
      details: { keys: ['PRESSLY_ADMIN_DATABASE_URL', 'DATABASE_URL'] },
    }),
  );
};

const toPublishCommand = (
  input: PricingCliCommand,
  env: PricingCliEnv,
): Result<PublishPricingChangeCommand, AppError> => {
  if (input.reason === undefined)
    return err(commandError('--reason is required for pricing changes.'));

  try {
    const actor = resolveCliActor(env);

    return ok({
      serviceSlug: input.serviceSlug,
      ...(input.locationSlug === undefined
        ? {}
        : { locationSlug: input.locationSlug }),
      reason: input.reason,
      actor: {
        id: actor.id,
        kind: actor.kind,
        displayName: actor.displayName,
        role: actor.role,
      },
      items: [...input.items],
    });
  } catch (error) {
    return err(normalizeUnknownError(error));
  }
};

const writeOutput = (
  io: PricingCliIO,
  output: unknown,
  json: boolean,
): void => {
  io.stdout.write(
    json
      ? `${JSON.stringify(output, null, 2)}\n`
      : `${String(output).trimEnd()}\n`,
  );
};

const writeError = (io: PricingCliIO, error: AppError, json: boolean): void => {
  io.stderr.write(
    json
      ? `${JSON.stringify({ ok: false, error }, null, 2)}\n`
      : `${renderAppError(error)}\n`,
  );
};

export const runPricingCli = async (
  argv: readonly string[],
  env: PricingCliEnv,
  io: PricingCliIO,
): Promise<number> => {
  const parsed = parsePricingCliCommand(argv);

  if (!parsed.ok) {
    writeError(io, parsed.error, false);
    io.stderr.write(`\n${usage}\n`);
    return 1;
  }

  if (parsed.value === 'help') {
    io.stdout.write(`${usage}\n`);
    return 0;
  }

  const command = parsed.value;
  const databaseUrl = readDatabaseUrl(env);

  if (!databaseUrl.ok) {
    writeError(io, databaseUrl.error, command.json);
    return 1;
  }

  const database = createDatabaseRuntime({
    databaseUrl: databaseUrl.value,
    maxConnections: 1,
  });

  try {
    const pricing = makePricingModule({ db: database.db });

    if (command.action === 'show') {
      const result = await pricing.admin.loadCatalog({
        serviceSlug: command.serviceSlug,
        ...(command.locationSlug === undefined
          ? {}
          : { locationSlug: command.locationSlug }),
      });

      if (!result.ok) {
        writeError(io, result.error, command.json);
        return 1;
      }

      writeOutput(
        io,
        command.json ? result.value : renderPricingCatalog(result.value),
        command.json,
      );
      return 0;
    }

    const publishCommand = toPublishCommand(command, env);

    if (!publishCommand.ok) {
      writeError(io, publishCommand.error, command.json);
      return 1;
    }

    if (command.action === 'plan') {
      const result = await pricing.admin.planChange(publishCommand.value);

      if (!result.ok) {
        writeError(io, result.error, command.json);
        return 1;
      }

      writeOutput(
        io,
        command.json ? result.value : renderPricingPlan(result.value),
        command.json,
      );
      return 0;
    }

    if (!command.confirm) {
      writeError(
        io,
        commandError('pricing publish requires --yes to commit.'),
        command.json,
      );
      return 1;
    }

    const result = await pricing.admin.publishChange(publishCommand.value);

    if (!result.ok) {
      writeError(io, result.error, command.json);
      return 1;
    }

    writeOutput(
      io,
      command.json ? result.value : renderPricingPublishResult(result.value),
      command.json,
    );

    return 0;
  } catch (error) {
    writeError(io, normalizeUnknownError(error), command.json);
    return 1;
  } finally {
    await database.close();
  }
};
