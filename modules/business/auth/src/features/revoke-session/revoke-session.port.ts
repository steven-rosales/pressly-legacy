import type { Result } from '@pressly/kernel';
import type { AppError } from '@pressly/errors';

export type AuthAuditEventInput = Readonly<{
  actorIdentityId?: string;
  eventType: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}>;

export type RevokeSessionStoreResult = Readonly<{
  sessionId?: string;
  identityId?: string;
}>;

export type RevokeSessionStore = Readonly<{
  revokeByTokenHash: (
    tokenHash: string,
    revokedAt: Date,
  ) => Promise<Result<RevokeSessionStoreResult, AppError>>;
  recordAuditEvent: (
    input: AuthAuditEventInput,
  ) => Promise<Result<void, AppError>>;
}>;

export type TokenHasher = Readonly<{
  hash: (rawToken: string) => string;
}>;

export type Clock = Readonly<{
  now: () => Date;
}>;
