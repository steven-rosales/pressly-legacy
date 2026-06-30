import type { Result } from '@pressly/kernel';
import type {
  AuthenticatedLoginResult,
  MfaEnrollmentResult,
  MfaMutationResult,
  MfaRecoveryCodesResult,
  LoginRequest,
  LogoutResult,
  SessionResult,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';

export type AuthCliClient = Readonly<{
  login: (
    request: LoginRequest,
    secondFactor?: Readonly<{
      method: 'totp' | 'recovery';
      code: string;
    }>,
  ) => Promise<Result<AuthenticatedLoginResult, AppError>>;
  loadSession: () => Promise<Result<SessionResult, AppError>>;
  logout: () => Promise<Result<LogoutResult, AppError>>;
  beginMfaEnrollment: () => Promise<Result<MfaEnrollmentResult, AppError>>;
  confirmMfaEnrollment: (
    code: string,
  ) => Promise<Result<MfaRecoveryCodesResult, AppError>>;
  regenerateMfaRecoveryCodes: () => Promise<
    Result<MfaRecoveryCodesResult, AppError>
  >;
  removeMfa: () => Promise<Result<MfaMutationResult, AppError>>;
  close: () => Promise<void>;
}>;
