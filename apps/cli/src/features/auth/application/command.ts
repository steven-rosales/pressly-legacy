import { result, type Result } from '@pressly/kernel';
import type {
  LoginResult,
  LogoutResult,
  SessionResult,
} from '@pressly/contracts';
import { type AppError } from '@pressly/errors';
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
      return result.err(commandError('--email is required for auth login.'));

    if (command.password === undefined || command.password.trim() === '')
      return result.err(commandError('--password is required for auth login.'));

    const loginResult = await client.login({
      email: command.email,
      password: command.password,
    });

    return result.isOk(loginResult)
      ? result.ok({ tag: 'login', value: loginResult.value })
      : result.err(loginResult.error);
  }

  if (command.action === 'session') {
    const sessionResult = await client.loadSession();

    return result.isOk(sessionResult)
      ? result.ok({ tag: 'session', value: sessionResult.value })
      : result.err(sessionResult.error);
  }

  const logoutResult = await client.logout();

  return result.isOk(logoutResult)
    ? result.ok({ tag: 'logout', value: logoutResult.value })
    : result.err(logoutResult.error);
};
