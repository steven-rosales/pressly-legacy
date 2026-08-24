import type { JsonObject } from '@pressly/codec';

export type RevokeSessionAuditEventInput = Readonly<{
  principalIdentityId?: string;
  eventType: string;
  resourceType: string;
  resourceId?: string;
  metadata?: JsonObject;
}>;

export type RevokeSessionStoreResult = Readonly<{
  sessionId?: string;
  identityId?: string;
}>;

export type RevokeSessionStore = Readonly<{
  revokeByTokenHash: (
    tokenHash: string,
    revokedAt: Date,
  ) => Promise<RevokeSessionStoreResult>;
  recordAuditEvent: (input: RevokeSessionAuditEventInput) => Promise<void>;
}>;

export type TokenHasher = Readonly<{
  hash: (rawToken: string) => string;
}>;
