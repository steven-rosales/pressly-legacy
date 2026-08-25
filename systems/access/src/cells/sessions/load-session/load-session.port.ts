import type { RoleAssignment } from '../../../model/authorization/public.ts';
import type { CustomerAudience } from '../../../model/authentication/public.ts';

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
}> &
  CustomerAudience;

export type LoadSessionStore = Readonly<{
  findByTokenHash: (
    tokenHash: string,
  ) => Promise<StoredSessionPrincipalRecord | undefined>;
  touchSession: (sessionId: string, now: Date) => Promise<void>;
}>;

export type TokenHasher = Readonly<{ hash: (rawToken: string) => string }>;
