import type { AppError, Result } from '@pressly/errors';

export type RevokeSessionStore = Readonly<{
  revokeByTokenHash: (
    tokenHash: string,
    revokedAt: Date,
  ) => Promise<Result<{ sessionId?: string; identityId?: string }, AppError>>;
  recordAuditEvent: (input: {
    actorIdentityId?: string;
    eventType: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<Result<void, AppError>>;
}>;

export type TokenHasher = Readonly<{
  hash: (rawToken: string) => string;
}>;

export type Clock = Readonly<{
  now: () => Date;
}>;
