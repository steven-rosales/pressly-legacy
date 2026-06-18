import type { StoredSessionPrincipal } from '@pressly/contracts';
import type { AppError, Result } from '@pressly/errors';

export type LoadSessionStore = Readonly<{
  findByTokenHash: (
    tokenHash: string,
  ) => Promise<Result<StoredSessionPrincipal | undefined, AppError>>;
  touchSession: (
    sessionId: string,
    now: Date,
  ) => Promise<Result<void, AppError>>;
}>;

export type TokenHasher = Readonly<{ hash: (rawToken: string) => string }>;

export type Clock = Readonly<{ now: () => Date }>;
