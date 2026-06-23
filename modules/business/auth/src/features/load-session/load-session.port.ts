import type { Result } from '@pressly/kernel';
import type { AppError } from '@pressly/errors';
import type { RoleAssignment } from '@pressly/auth/authorization';

export type StoredSessionPrincipalRecord = Readonly<{
  sessionId: string;
  identityId: string;
  kind: 'human' | 'service';
  displayName: string;
  email?: string;
  isActive: boolean;
  assignments: readonly RoleAssignment[];
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
}>;

export type LoadSessionStore = Readonly<{
  findByTokenHash: (
    tokenHash: string,
  ) => Promise<Result<StoredSessionPrincipalRecord | undefined, AppError>>;
  touchSession: (
    sessionId: string,
    now: Date,
  ) => Promise<Result<void, AppError>>;
}>;

export type TokenHasher = Readonly<{ hash: (rawToken: string) => string }>;
export type Clock = Readonly<{ now: () => Date }>;
