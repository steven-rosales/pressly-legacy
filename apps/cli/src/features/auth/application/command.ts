import { result, type Result } from '@pressly/kernel';
import type {
  AuthenticatedLoginResult,
  LogoutResult,
  MfaEnrollmentResult,
  MfaMutationResult,
  MfaRecoveryCodesResult,
  SessionResult,
} from '@pressly/contracts/auth';
import { type AppError } from '@pressly/errors/app-error';
import { commandError } from '../../../shell/command-error.ts';
import type { AuthCliClient } from './ports.ts';

export type AuthCliAction =
  | 'login'
  | 'session'
  | 'logout'
  | 'mfa-enroll'
  | 'mfa-confirm'
  | 'mfa-recovery-codes'
  | 'mfa-remove';

export type AuthCliCommand = Readonly<{
  action: AuthCliAction;
  email?: string;
  password?: string;
  mfaCode?: string;
  recoveryCode?: string;
  code?: string;
  json: boolean;
}>;

export type AuthCliOutput =
  | Readonly<{ tag: 'login'; value: AuthenticatedLoginResult }>
  | Readonly<{ tag: 'session'; value: SessionResult }>
  | Readonly<{ tag: 'logout'; value: LogoutResult }>
  | Readonly<{ tag: 'mfa-enrollment'; value: MfaEnrollmentResult }>
  | Readonly<{ tag: 'mfa-recovery-codes'; value: MfaRecoveryCodesResult }>
  | Readonly<{ tag: 'mfa-removed'; value: MfaMutationResult }>;

export const runAuthCommand = async (
  command: AuthCliCommand,
  client: AuthCliClient,
): Promise<Result<AuthCliOutput, AppError>> => {
  if (command.action === 'login') {
    if (command.email === undefined || command.email.trim() === '')
      return result.err(commandError('--email is required for auth login.'));

    if (command.password === undefined || command.password.trim() === '')
      return result.err(commandError('--password is required for auth login.'));

    const loginResult = await client.login(
      {
        email: command.email,
        password: command.password,
      },
      command.mfaCode === undefined
        ? command.recoveryCode === undefined
          ? undefined
          : { method: 'recovery', code: command.recoveryCode }
        : { method: 'totp', code: command.mfaCode },
    );

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

  if (command.action === 'mfa-enroll') {
    const enrolled = await client.beginMfaEnrollment();
    return result.isOk(enrolled)
      ? result.ok({ tag: 'mfa-enrollment', value: enrolled.value })
      : result.err(enrolled.error);
  }

  if (command.action === 'mfa-confirm') {
    if (command.code === undefined)
      return result.err(commandError('--code is required for mfa-confirm.'));
    const confirmed = await client.confirmMfaEnrollment(command.code);
    return result.isOk(confirmed)
      ? result.ok({ tag: 'mfa-recovery-codes', value: confirmed.value })
      : result.err(confirmed.error);
  }

  if (command.action === 'mfa-recovery-codes') {
    const regenerated = await client.regenerateMfaRecoveryCodes();
    return result.isOk(regenerated)
      ? result.ok({ tag: 'mfa-recovery-codes', value: regenerated.value })
      : result.err(regenerated.error);
  }

  if (command.action === 'mfa-remove') {
    const removed = await client.removeMfa();
    return result.isOk(removed)
      ? result.ok({ tag: 'mfa-removed', value: removed.value })
      : result.err(removed.error);
  }

  const logoutResult = await client.logout();

  return result.isOk(logoutResult)
    ? result.ok({ tag: 'logout', value: logoutResult.value })
    : result.err(logoutResult.error);
};
