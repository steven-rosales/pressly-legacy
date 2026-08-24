export type RemoveMfaStore = Readonly<{
  removeMfa: (input: {
    identityId: string;
    sessionId: string;
    now: Date;
  }) => Promise<void>;
}>;
