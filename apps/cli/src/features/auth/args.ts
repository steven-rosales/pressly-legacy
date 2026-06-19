import { result, type Result } from '@pressly/kernel';
import { parseArgs } from 'node:util';
import { normalizeUnknownError, type AppError } from '@pressly/errors';
import { commandError } from '../../shell/command-error.ts';
import type { AuthCliCommand } from './application/command.ts';

export const authUsage = [
  'Pressly auth CLI',
  '',
  'Usage:',
  '  pressly-admin auth login --email user@example.com --password "password"',
  '  pressly-admin auth session',
  '  pressly-admin auth logout',
  '',
  'Options:',
  '  --email     Email for login',
  '  --password  Password for login',
  '  --json      Print JSON output',
  '  --help      Show help',
].join('\n');

const getSingleString = (
  values: ReturnType<typeof parseArgs>['values'],
  key: string,
): string | undefined => {
  const value = values[key];

  if (value === undefined || typeof value === 'boolean') return undefined;
  if (Array.isArray(value))
    return value
      .filter((item): item is string => typeof item === 'string')
      .at(-1);

  return value;
};

const getBoolean = (
  values: ReturnType<typeof parseArgs>['values'],
  key: string,
): boolean => values[key] === true;

export const parseAuthCliCommand = (
  argv: readonly string[],
): Result<AuthCliCommand | 'help', AppError> => {
  let parsed: ReturnType<typeof parseArgs>;
  const args = argv[0] === '--' ? argv.slice(1) : argv;

  try {
    parsed = parseArgs({
      args: [...args],
      allowPositionals: true,
      options: {
        email: { type: 'string' },
        password: { type: 'string' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    return result.err(commandError(normalizeUnknownError(error).message));
  }

  if (getBoolean(parsed.values, 'help')) return result.ok('help');

  const [namespace, action] = parsed.positionals;

  if (namespace !== 'auth')
    return result.err(commandError('Expected command namespace: auth.'));

  if (action !== 'login' && action !== 'session' && action !== 'logout')
    return result.err(
      commandError('Expected auth action: login, session, or logout.'),
    );

  const email = getSingleString(parsed.values, 'email');
  const password = getSingleString(parsed.values, 'password');

  return result.ok({
    action,
    ...(email === undefined ? {} : { email }),
    ...(password === undefined ? {} : { password }),
    json: getBoolean(parsed.values, 'json'),
  });
};
