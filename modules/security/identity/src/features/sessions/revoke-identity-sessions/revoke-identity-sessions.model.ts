export type RevokeIdentitySessionsCommand = Readonly<{
  principalIdentityId: string;
  identityId: string;
  sessionId?: string;
  requestId?: string;
}>;

export type RevokeIdentitySessionsOutcome = Readonly<{
  revokedCount: number;
}>;
