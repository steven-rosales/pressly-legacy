export type StoredSessionSummary = Readonly<{
  id: string;
  issuedAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}>;

export type IdentitySessionStore = Readonly<{
  listIdentitySessions: (
    identityId: string,
  ) => Promise<readonly StoredSessionSummary[]>;
  revokeIdentitySessions: (input: {
    principalIdentityId: string;
    identityId: string;
    sessionId?: string;
    revokedAt: Date;
  }) => Promise<number>;
}>;
