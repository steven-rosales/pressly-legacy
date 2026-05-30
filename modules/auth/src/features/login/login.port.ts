import type { Principal, Role } from '@pressly/auth';
import type { AppError, Result } from '@pressly/errors';

export type LoginIdentityRecord = Readonly<{
  id: string;
  kind: 'human' | 'service';
  displayName: string;
  email?: string;
  isActive: boolean;
  roles: readonly Role[];
}>;

export type LoginPasswordCredentialRecord = Readonly<{
  identityId: string;
  passwordHash: string;
}>;

export type CreateSessionInput = Readonly<{
  identityId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
}>;

export type CreatedSession = Readonly<{
  id: string;
  issuedAt: Date;
  expiresAt: Date;
}>;

export type LoginAttemptInput = Readonly<{
  emailNormalized: string;
  identityId?: string;
  success: boolean;
  failureCode?: string;
  ipAddress?: string;
  userAgent?: string;
}>;

export type AuthAuditEventInput = Readonly<{
  actorIdentityId?: string;
  eventType: string;
  resourceType: string;
  resourceId?: string;
  metadata: Record<string, unknown>;
}>;

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

export type LoginPrincipal = Principal;
