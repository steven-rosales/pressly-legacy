import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';

export type MfaManagementStore = Readonly<{
  replaceRecoveryCodes: (input: {
    identityId: string;
    recoveryCodeHashes: readonly string[];
    now: Date;
  }) => Promise<Result<void, AppError>>;

  removeMfa: (input: {
    identityId: string;
    sessionId: string;
    now: Date;
  }) => Promise<Result<void, AppError>>;
}>;

export type Clock = Readonly<{ now: () => Date }>;
