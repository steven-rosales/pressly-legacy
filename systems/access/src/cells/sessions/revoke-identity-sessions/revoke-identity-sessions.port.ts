export type RevokeIdentitySessionsStore = Readonly<{
  revokeIdentitySessions: (input: {
    principalIdentityId: string;
    identityId: string;
    sessionId?: string;
    revokedAt: Date;
  }) => Promise<number>;
}>;
