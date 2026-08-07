export type StoredSessionSummary = Readonly<{
  id: string;
  issuedAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}>;

export type ListIdentitySessionsStore = Readonly<{
  listIdentitySessions: (
    identityId: string,
  ) => Promise<readonly StoredSessionSummary[]>;
}>;
