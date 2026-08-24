import type { Role } from '../../../model/authorization/public.ts';
import type { CustomerAudience } from '../../../model/authentication/public.ts';
import type { JsonObject } from '@pressly/codec';

export type LoginIdentityRecord = Readonly<{
  id: string;
  kind: 'human' | 'service';
  displayName: string;
  email?: string;
  isActive: boolean;
  roles: readonly Role[];
  mfaEnabled: boolean;
}> &
  CustomerAudience;

export type LoginPasswordCredentialRecord = Readonly<{
  identityId: string;
  passwordHash: string;
}>;

export type CreateSessionInput = Readonly<{
  identityId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  lastUsedAt: Date;
  assuranceLevel: 'password' | 'mfa' | 'service_key';
}>;

export type CreatedSession = Readonly<{
  id: string;
  issuedAt: Date;
  expiresAt: Date;
}>;

export type CreateMfaChallengeInput = Readonly<{
  identityId: string;
  tokenHash: string;
  expiresAt: Date;
}>;

export type LoginAttemptInput = Readonly<{
  emailNormalized: string;
  identityId?: string;
  success: boolean;
  failureCode?: string;
  ipAddress?: string;
  userAgent?: string;
}>;

export type LoginAuditEventInput = Readonly<{
  principalIdentityId?: string;
  eventType: string;
  resourceType: string;
  resourceId?: string;
  metadata?: JsonObject;
}>;

export type LoginStore = Readonly<{
  findIdentityByEmail: (
    emailNormalized: string,
  ) => Promise<LoginIdentityRecord | undefined>;
  findPasswordCredential: (
    identityId: string,
  ) => Promise<LoginPasswordCredentialRecord | undefined>;
  countRecentFailedAttempts: (input: {
    emailNormalized: string;
    since: Date;
  }) => Promise<number>;
  createSession: (input: CreateSessionInput) => Promise<CreatedSession>;
  createMfaChallenge: (input: CreateMfaChallengeInput) => Promise<void>;
  recordLoginAttempt: (input: LoginAttemptInput) => Promise<void>;
  recordAuditEvent: (input: LoginAuditEventInput) => Promise<void>;
}>;

export type PasswordVerifier = Readonly<{
  verify: (passwordHash: string, plainTextPassword: string) => Promise<boolean>;
}>;

export type TokenIssuer = Readonly<{
  issue: () => string;
  hash: (rawToken: string) => string;
}>;
