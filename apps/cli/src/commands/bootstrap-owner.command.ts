import { pathToFileURL } from 'node:url';
import { createDatabaseRuntime } from '@pressly/db/client';
import { normalizeUnknownError } from '@pressly/errors/app-error';
import {
  configError,
  conflictError,
  validationError,
} from '@pressly/errors/factories';
import { result } from '@pressly/kernel';
import {
  makePostgresBootstrapOwner,
  type BootstrapOwner,
  type BootstrapOwnerCommand,
  type BootstrapOwnerFailure,
  type BootstrapOwnerResult,
} from '@pressly/identity';

const PRELAUNCH_BUSINESS_ID = '00000000-0000-4000-8000-000000000100';

export type BootstrapOwnerEnvironment = Readonly<{
  DATABASE_URL?: string;
  PRESSLY_BOOTSTRAP_BUSINESS_ID?: string;
  PRESSLY_BOOTSTRAP_OWNER_EMAIL?: string;
  PRESSLY_BOOTSTRAP_OWNER_CONFIRM?: string;
  PRESSLY_DEBUG_BOOTSTRAP_OWNER?: string;
}>;

const bootstrapOwnerCommandError = (failure: BootstrapOwnerFailure) =>
  failure.kind === 'conflict'
    ? conflictError({
        code: failure.code,
        message: failure.message,
        safeMessage: failure.message,
      })
    : validationError({
        code: failure.code,
        message: failure.message,
        safeMessage: failure.message,
        ...('violations' in failure
          ? { publicDetails: { violations: failure.violations } }
          : {}),
      });

export const requiredBootstrapOwnerEnvironmentValue = (
  environment: BootstrapOwnerEnvironment,
  key:
    | 'DATABASE_URL'
    | 'PRESSLY_BOOTSTRAP_OWNER_EMAIL'
    | 'PRESSLY_BOOTSTRAP_OWNER_CONFIRM',
): string => {
  const value = environment[key];

  if (value !== undefined && value.trim() !== '') return value;

  throw configError({
    code: 'missing_bootstrap_owner_env',
    message: `${key} is required to bootstrap the first owner.`,
    safeMessage: `${key} is required.`,
    details: { key },
  });
};

export const parseBootstrapOwnerArgs = (
  args: readonly string[],
  stdinIsTty: boolean,
): Readonly<{ passwordFromStdin: true }> => {
  const optionArgs = args.filter((arg) => arg !== '--');
  const unexpectedArgs = optionArgs.filter((arg) => arg !== '--password-stdin');

  if (unexpectedArgs.length > 0)
    throw validationError({
      code: 'unexpected_bootstrap_owner_arg',
      message:
        'Owner bootstrap received unexpected command line arguments. Passwords must not be passed as arguments.',
      safeMessage:
        'Do not pass the owner password as an argument. Pipe it with --password-stdin.',
      details: { count: unexpectedArgs.length },
    });

  if (optionArgs.includes('--password-stdin') && !stdinIsTty)
    return { passwordFromStdin: true };

  throw validationError({
    code: 'missing_password_stdin',
    message: 'Owner bootstrap password must be piped with --password-stdin.',
    safeMessage: 'Pipe the owner password with --password-stdin.',
  });
};

export const toBootstrapOwnerCommand = (
  environment: BootstrapOwnerEnvironment,
  password: string,
): BootstrapOwnerCommand => ({
  businessId:
    environment.PRESSLY_BOOTSTRAP_BUSINESS_ID?.trim() || PRELAUNCH_BUSINESS_ID,
  email: requiredBootstrapOwnerEnvironmentValue(
    environment,
    'PRESSLY_BOOTSTRAP_OWNER_EMAIL',
  ),
  password,
  confirmation: requiredBootstrapOwnerEnvironmentValue(
    environment,
    'PRESSLY_BOOTSTRAP_OWNER_CONFIRM',
  ),
});

export const executeBootstrapOwner = async (
  input: Readonly<{
    bootstrapOwner: BootstrapOwner;
    command: BootstrapOwnerCommand;
  }>,
): Promise<BootstrapOwnerResult> => {
  const outcome = await input.bootstrapOwner(input.command);

  if (result.isErr(outcome)) throw bootstrapOwnerCommandError(outcome.error);

  return outcome.value;
};

const readPasswordFromStdin = async (): Promise<string> =>
  new Promise((resolve, reject) => {
    let value = '';

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      value += chunk;
    });
    process.stdin.on('end', () => {
      resolve(value.replace(/\r?\n$/, ''));
    });
    process.stdin.on('error', reject);
  });

const main = async (): Promise<void> => {
  parseBootstrapOwnerArgs(process.argv.slice(2), process.stdin.isTTY);

  const environment = process.env;
  const database = createDatabaseRuntime({
    databaseUrl: requiredBootstrapOwnerEnvironmentValue(
      environment,
      'DATABASE_URL',
    ),
    maxConnections: 1,
  });

  try {
    const outcome = await executeBootstrapOwner({
      bootstrapOwner: makePostgresBootstrapOwner(database.db),
      command: toBootstrapOwnerCommand(
        environment,
        await readPasswordFromStdin(),
      ),
    });

    process.stdout.write(`owner bootstrap completed for ${outcome.email}\n`);
  } finally {
    await database.close();
  }
};

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain)
  main().catch((error: unknown) => {
    const appError = normalizeUnknownError(error);

    process.stderr.write(`${appError.safeMessage}\n`);

    if (process.env['PRESSLY_DEBUG_BOOTSTRAP_OWNER'] === '1')
      process.stderr.write(`${appError.stack ?? appError.message}\n`);

    process.exitCode = 1;
  });
