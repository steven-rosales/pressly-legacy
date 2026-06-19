import type { Result } from '@pressly/kernel';
import type {
  AuthAuditEventInput,
  CreatedSession,
  CreateSessionInput,
  LoginAttemptInput,
  LoginIdentityRecord,
  LoginPasswordCredentialRecord,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';

export type LoginStore = Readonly<{
  findIdentityByEmail: (
    emailNormalized: string,
  ) => Promise<Result<LoginIdentityRecord | undefined, AppError>>;
  findPasswordCredential: (
    identityId: string,
  ) => Promise<Result<LoginPasswordCredentialRecord | undefined, AppError>>;
  countRecentFailedAttempts: (input: {
    emailNormalized: string;
    since: Date;
  }) => Promise<Result<number, AppError>>;
  createSession: (
    input: CreateSessionInput,
  ) => Promise<Result<CreatedSession, AppError>>;
  recordLoginAttempt: (
    input: LoginAttemptInput,
  ) => Promise<Result<void, AppError>>;
  recordAuditEvent: (
    input: AuthAuditEventInput,
  ) => Promise<Result<void, AppError>>;
}>;

export type PasswordVerifier = Readonly<{
  verify: (
    passwordHash: string,
    plainTextPassword: string,
  ) => Promise<Result<boolean, AppError>>;
}>;

export type TokenIssuer = Readonly<{
  issue: () => string;
  hash: (rawToken: string) => string;
}>;

export type Clock = Readonly<{ now: () => Date }>;
