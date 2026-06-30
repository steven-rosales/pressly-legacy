import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';

export type StoredSessionSummary = Readonly<{
  id: string;
  issuedAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}>;

export type AdministerSessionsStore = Readonly<{
  listIdentitySessions: (
    identityId: string,
  ) => Promise<Result<readonly StoredSessionSummary[], AppError>>;
  revokeIdentitySessions: (input: {
    principalIdentityId: string;
    identityId: string;
    sessionId?: string;
    revokedAt: Date;
  }) => Promise<Result<number, AppError>>;
}>;

export type Clock = Readonly<{ now: () => Date }>;
