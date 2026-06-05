import type {
  LoginResult,
  LogoutResult,
  SessionResult,
} from '@pressly/contracts';
import { err, ok, type AppError, type Result } from '@pressly/errors';
import { commandError } from '../../../shell/command-error.ts';
import type { AuthCliClient } from './ports.ts';

export type AuthCliAction = 'login' | 'session' | 'logout';

export type AuthCliCommand = Readonly<{
  action: AuthCliAction;
  email?: string;
  password?: string;
  json: boolean;
}>;

export type AuthCliOutput =
  | Readonly<{ tag: 'login'; value: LoginResult }>
  | Readonly<{ tag: 'session'; value: SessionResult }>
  | Readonly<{ tag: 'logout'; value: LogoutResult }>;

export const runAuthCommand = async (
  command: AuthCliCommand,
  client: AuthCliClient,
): Promise<Result<AuthCliOutput, AppError>> => {
  if (command.action === 'login') {
    if (command.email === undefined || command.email.trim() === '')
      return err(commandError('--email is required for auth login.'));

    if (command.password === undefined || command.password.trim() === '')
      return err(commandError('--password is required for auth login.'));

    const result = await client.login({
      email: command.email,
      password: command.password,
    });

    return result.ok
      ? ok({ tag: 'login', value: result.value })
      : err(result.error);
  }

  if (command.action === 'session') {
    const result = await client.loadSession();

    return result.ok
      ? ok({ tag: 'session', value: result.value })
      : err(result.error);
  }

  const result = await client.logout();

  return result.ok
    ? ok({ tag: 'logout', value: result.value })
    : err(result.error);
};
