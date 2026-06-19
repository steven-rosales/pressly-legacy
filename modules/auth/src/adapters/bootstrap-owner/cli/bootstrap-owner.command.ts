import { createDatabaseRuntime } from '@pressly/db';
import { makePasswordHasher } from '@pressly/auth';
import { result } from '@pressly/kernel';
import { makeAppError, normalizeUnknownError } from '@pressly/errors';
import { makeBootstrapOwnerStore } from '../persistence/bootstrap-owner.repo.ts';
import { makeBootstrapOwner } from '../../../features/bootstrap-owner/bootstrap-owner.usecase.ts';

const readRequiredEnv = (key: string): string => {
  const value = process.env[key];

  if (value !== undefined && value.trim() !== '') return value;

  throw makeAppError({
    kind: 'ConfigError',
    code: 'missing_bootstrap_owner_env',
    message: `${key} is required to bootstrap the first owner.`,
    safeMessage: `${key} is required.`,
    status: 500,
    details: { key },
  });
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

const requirePasswordStdinMode = (args: readonly string[]): void => {
  const optionArgs = args.filter((arg) => arg !== '--');
  const unexpectedArgs = optionArgs.filter((arg) => arg !== '--password-stdin');

  if (unexpectedArgs.length > 0)
    throw makeAppError({
      kind: 'ValidationError',
      code: 'unexpected_bootstrap_owner_arg',
      message:
        'Owner bootstrap received unexpected command line arguments. Passwords must not be passed as arguments.',
      safeMessage:
        'Do not pass the owner password as an argument. Pipe it with --password-stdin.',
      status: 400,
      details: { count: unexpectedArgs.length },
    });

  if (optionArgs.includes('--password-stdin') && !process.stdin.isTTY) return;

  throw makeAppError({
    kind: 'ValidationError',
    code: 'missing_password_stdin',
    message: 'Owner bootstrap password must be piped with --password-stdin.',
    safeMessage: 'Pipe the owner password with --password-stdin.',
    status: 400,
  });
};

const main = async (): Promise<void> => {
  requirePasswordStdinMode(process.argv.slice(2));

  const database = createDatabaseRuntime({
    databaseUrl: readRequiredEnv('DATABASE_URL'),
    maxConnections: 1,
  });

  try {
    const bootstrapOwner = makeBootstrapOwner({
      store: makeBootstrapOwnerStore(database.db),
      passwordHasher: makePasswordHasher(),
    });

    const bootstrapResult = await bootstrapOwner({
      email: readRequiredEnv('PRESSLY_BOOTSTRAP_OWNER_EMAIL'),
      password: await readPasswordFromStdin(),
      confirmation: readRequiredEnv('PRESSLY_BOOTSTRAP_OWNER_CONFIRM'),
    });

    if (result.isErr(bootstrapResult)) throw bootstrapResult.error;

    console.log(`owner bootstrap completed for ${bootstrapResult.value.email}`);
  } finally {
    await database.close();
  }
};

main().catch((error: unknown) => {
  const appError = normalizeUnknownError(error);

  process.stderr.write(`${appError.safeMessage}\n`);

  if (process.env['PRESSLY_DEBUG_BOOTSTRAP_OWNER'] === '1')
    process.stderr.write(`${appError.stack ?? appError.message}\n`);

  process.exitCode = 1;
});
