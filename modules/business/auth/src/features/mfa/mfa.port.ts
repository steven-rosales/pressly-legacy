import type { Role } from '@pressly/auth/authorization';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';

export type MfaChallengeRecord = Readonly<{
  challengeId: string;
  identityId: string;
  kind: 'human' | 'service';
  displayName: string;
  email?: string;
  isActive: boolean;
  roles: readonly Role[];
  encryptedSecret: string;
  lastUsedCounter: number | null;
  expiresAt: Date;
  consumedAt: Date | null;
}>;

export type MfaCredentialRecord = Readonly<{
  identityId: string;
  encryptedSecret: string;
  status: 'pending' | 'enabled';
  lastUsedCounter: number | null;
}>;

export type CompletedMfaSession = Readonly<{
  status: 'completed';
  issuedAt: Date;
  expiresAt: Date;
}>;

export type MfaCompletionResult =
  | CompletedMfaSession
  | Readonly<{ status: 'rejected' }>;

export type MfaStore = Readonly<{
  findChallengeByTokenHash: (
    tokenHash: string,
  ) => Promise<Result<MfaChallengeRecord | undefined, AppError>>;
  completeTotpChallenge: (input: {
    challengeId: string;
    identityId: string;
    counter: number;
    sessionTokenHash: string;
    issuedAt: Date;
    expiresAt: Date;
  }) => Promise<Result<MfaCompletionResult, AppError>>;
  completeRecoveryChallenge: (input: {
    challengeId: string;
    identityId: string;
    recoveryCodeHash: string;
    sessionTokenHash: string;
    issuedAt: Date;
    expiresAt: Date;
  }) => Promise<Result<MfaCompletionResult, AppError>>;
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
export type TokenService = Readonly<{
  issue: () => string;
  hash: (rawToken: string) => string;
}>;
