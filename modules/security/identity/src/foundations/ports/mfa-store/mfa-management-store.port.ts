export type MfaManagementStore = Readonly<{
  replaceRecoveryCodes: (input: {
    identityId: string;
    recoveryCodeHashes: readonly string[];
    now: Date;
  }) => Promise<void>;

  removeMfa: (input: {
    identityId: string;
    sessionId: string;
    now: Date;
  }) => Promise<void>;
}>;
