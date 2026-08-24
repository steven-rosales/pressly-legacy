import type { Role } from '../../../model/authorization/public.ts';
import type { CustomerAudience } from '../../../model/authentication/public.ts';

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
}> &
  CustomerAudience;

export type MfaChallengeReservation =
  | Readonly<{ status: 'reserved'; challenge: MfaChallengeRecord }>
  | Readonly<{ status: 'expired' }>
  | Readonly<{ status: 'exhausted' }>
  | Readonly<{ status: 'invalid' }>;

export type CompletedMfaSession = Readonly<{
  status: 'completed';
  issuedAt: Date;
  expiresAt: Date;
}>;

export type MfaCompletionResult =
  | CompletedMfaSession
  | Readonly<{ status: 'rejected' }>;

export type CompleteMfaChallengeStore = Readonly<{
  reserveChallengeAttempt: (input: {
    tokenHash: string;
    now: Date;
    maxAttempts: number;
  }) => Promise<MfaChallengeReservation>;
  rejectReservedChallengeAttempt: (input: {
    challengeId: string;
    identityId: string;
    now: Date;
    maxAttempts: number;
  }) => Promise<void>;
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
