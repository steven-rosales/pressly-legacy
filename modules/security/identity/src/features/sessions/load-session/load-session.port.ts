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
  lastUsedAt: Date;
  assuranceLevel: 'password' | 'mfa' | 'service_key';
}>;

export type LoadSessionStore = Readonly<{
  findByTokenHash: (
    tokenHash: string,
  ) => Promise<StoredSessionPrincipalRecord | undefined>;
  touchSession: (sessionId: string, now: Date) => Promise<void>;
}>;

export type TokenHasher = Readonly<{ hash: (rawToken: string) => string }>;
