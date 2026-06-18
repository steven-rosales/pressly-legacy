import type { z } from 'zod';
import type {
  authPrincipalSchema,
  loginResultSchema,
  logoutResultSchema,
  sessionResultSchema,
} from './auth.contracts.ts';
import type { AuthIdentityKind, AuthRole } from './auth.command.ts';

export type AuthPrincipalResult = z.infer<typeof authPrincipalSchema>;
export type LoginResult = z.infer<typeof loginResultSchema>;
export type SessionResult = z.infer<typeof sessionResultSchema>;
export type LogoutResult = z.infer<typeof logoutResultSchema>;

export type LoginIdentityRecord = Readonly<{
  id: string;
  kind: AuthIdentityKind;
  displayName: string;
  email?: string;
  isActive: boolean;
  roles: readonly AuthRole[];
}>;

export type LoginPasswordCredentialRecord = Readonly<{
  identityId: string;
  passwordHash: string;
}>;

export type CreatedSession = Readonly<{
  id: string;
  issuedAt: Date;
  expiresAt: Date;
}>;

export type StoredSessionPrincipal = Readonly<{
  sessionId: string;
  identityId: string;
  kind: AuthIdentityKind;
  displayName: string;
  email?: string;
  isActive: boolean;
  roles: readonly AuthRole[];
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
}>;

export type LoadSessionResult = Readonly<{
  identityId: string;
  kind: AuthIdentityKind;
  displayName: string;
  email?: string;
  roles: readonly AuthRole[];
  sessionId?: string;
  sessionIssuedAt?: Date;
  sessionExpiresAt?: Date;
}>;

export type RevokeSessionStoreResult = Readonly<{
  sessionId?: string;
  identityId?: string;
}>;

export type BootstrapOwnerResult = Readonly<{
  identityId: string;
  email: string;
  role: 'owner';
}>;

export type BootstrapOwnerStoreResult =
  | Readonly<{
      status: 'created';
      identityId: string;
    }>
  | Readonly<{ status: 'owner_exists' }>
  | Readonly<{ status: 'identity_exists' }>;
