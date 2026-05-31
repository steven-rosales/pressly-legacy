import type { Principal, Role } from '@pressly/auth';
import type { AppError, Result } from '@pressly/errors';

export type StoredSessionPrincipal = Readonly<{
  sessionId: string;
  identityId: string;
  kind: 'human' | 'service';
  displayName: string;
  email?: string;
  isActive: boolean;
  roles: readonly Role[];
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
}>;

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

export type LoadedPrincipal = Principal;
