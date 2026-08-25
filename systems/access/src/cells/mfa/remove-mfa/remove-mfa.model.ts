export type RemoveMfaCommand = Readonly<{
  identityId: string;
  sessionId: string;
  requestId?: string;
}>;

export type MfaMutation = Readonly<{ updated: true }>;
