import { result, type Result } from '@pressly/kernel';
import { parseArgs } from 'node:util';
import { normalizeUnknownError, type AppError } from '@pressly/errors';
import { commandError } from '../../shell/command-error.ts';
import type { AuthCliCommand } from './application/command.ts';

export const authUsage = [
  'Pressly auth CLI',
  '',
  'Usage:',
  '  pressly-admin auth login --email user@example.com --password "password" [--mfa-code 123456]',
  '  pressly-admin auth session',
  '  pressly-admin auth logout',
  '  pressly-admin auth mfa-enroll',
  '  pressly-admin auth mfa-confirm --code 123456',
  '  pressly-admin auth mfa-recovery-codes',
  '  pressly-admin auth mfa-remove',
  '',
  'Options:',
  '  --email     Email for login',
  '  --password  Password for login',
  '  --mfa-code  Six-digit authenticator code for login',
  '  --recovery-code  One-time recovery code for login',
  '  --code      Six-digit code for enrollment confirmation',
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
        'mfa-code': { type: 'string' },
        'recovery-code': { type: 'string' },
        code: { type: 'string' },
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

  const allowedActions = new Set([
    'login',
    'session',
    'logout',
    'mfa-enroll',
    'mfa-confirm',
    'mfa-recovery-codes',
    'mfa-remove',
  ] as const);
  if (!allowedActions.has(action as never))
    return result.err(commandError('Expected a supported auth action.'));

  const email = getSingleString(parsed.values, 'email');
  const password = getSingleString(parsed.values, 'password');
  const mfaCode = getSingleString(parsed.values, 'mfa-code');
  const recoveryCode = getSingleString(parsed.values, 'recovery-code');
  const code = getSingleString(parsed.values, 'code');

  if (mfaCode !== undefined && recoveryCode !== undefined)
    return result.err(
      commandError('Use either --mfa-code or --recovery-code, not both.'),
    );

  return result.ok({
    action: action as AuthCliCommand['action'],
    ...(email === undefined ? {} : { email }),
    ...(password === undefined ? {} : { password }),
    ...(mfaCode === undefined ? {} : { mfaCode }),
    ...(recoveryCode === undefined ? {} : { recoveryCode }),
    ...(code === undefined ? {} : { code }),
    json: getBoolean(parsed.values, 'json'),
  });
};
