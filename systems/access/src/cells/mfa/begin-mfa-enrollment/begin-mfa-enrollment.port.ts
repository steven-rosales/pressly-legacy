export type BeginMfaEnrollmentStore = Readonly<{
  beginEnrollment: (input: {
    identityId: string;
    encryptedSecret: string;
    now: Date;
  }) => Promise<'pending' | 'already_enabled'>;
}>;
