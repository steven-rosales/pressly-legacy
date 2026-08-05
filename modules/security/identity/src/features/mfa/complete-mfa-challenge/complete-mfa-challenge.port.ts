import type { Role } from '@pressly/auth/authorization';

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

export type CompletedMfaSession = Readonly<{
  status: 'completed';
  issuedAt: Date;
  expiresAt: Date;
}>;

export type MfaCompletionResult =
  | CompletedMfaSession
  | Readonly<{ status: 'rejected' }>;

export type CompleteMfaChallengeStore = Readonly<{
  findChallengeByTokenHash: (
    tokenHash: string,
  ) => Promise<MfaChallengeRecord | undefined>;
  completeTotpChallenge: (input: {
    challengeId: string;
    identityId: string;
    counter: number;
    sessionTokenHash: string;
    issuedAt: Date;
    expiresAt: Date;
  }) => Promise<MfaCompletionResult>;
  completeRecoveryChallenge: (input: {
    challengeId: string;
    identityId: string;
    recoveryCodeHash: string;
    sessionTokenHash: string;
    issuedAt: Date;
    expiresAt: Date;
  }) => Promise<MfaCompletionResult>;
}>;

export type MfaChallengeTokenService = Readonly<{
  issue: () => string;
  hash: (rawToken: string) => string;
}>;
