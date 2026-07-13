import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';

export type MfaCredentialRecord = Readonly<{
  identityId: string;
  encryptedSecret: string;
  status: 'pending' | 'enabled';
  lastUsedCounter: number | null;
}>;

export type MfaEnrollmentStore = Readonly<{
  beginEnrollment: (input: {
    identityId: string;
    encryptedSecret: string;
    now: Date;
  }) => Promise<Result<'pending' | 'already_enabled', AppError>>;

  findCredential: (
    identityId: string,
  ) => Promise<Result<MfaCredentialRecord | undefined, AppError>>;

  confirmEnrollment: (input: {
    identityId: string;
    sessionId: string;
    counter: number;
    recoveryCodeHashes: readonly string[];
    now: Date;
  }) => Promise<Result<boolean, AppError>>;
}>;

export type Clock = Readonly<{ now: () => Date }>;
