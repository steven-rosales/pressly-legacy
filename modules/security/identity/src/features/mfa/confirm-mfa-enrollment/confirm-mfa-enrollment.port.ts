export type MfaCredentialRecord = Readonly<{
  identityId: string;
  encryptedSecret: string;
  status: 'pending' | 'enabled';
  lastUsedCounter: number | null;
}>;

export type ConfirmMfaEnrollmentStore = Readonly<{
  findCredential: (
    identityId: string,
  ) => Promise<MfaCredentialRecord | undefined>;
  confirmEnrollment: (input: {
    identityId: string;
    sessionId: string;
    counter: number;
    recoveryCodeHashes: readonly string[];
    now: Date;
  }) => Promise<boolean>;
}>;
