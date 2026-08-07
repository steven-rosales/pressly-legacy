export type RegenerateMfaRecoveryCodesStore = Readonly<{
  replaceRecoveryCodes: (input: {
    identityId: string;
    recoveryCodeHashes: readonly string[];
    now: Date;
  }) => Promise<void>;
}>;
