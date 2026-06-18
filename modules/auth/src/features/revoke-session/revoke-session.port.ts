import type {
  AuthAuditEventInput,
  RevokeSessionStoreResult,
} from '@pressly/contracts';
import type { AppError, Result } from '@pressly/errors';

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
