import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  StoreMutationResult,
  StoreFailureReason,
  WorkforceActorRef,
  WorkforceInvitationPreview,
  WorkforceInvitationSummary,
  WorkforceRole,
} from './workforce.model.ts';
import type { WorkforceCursor } from './workforce-pagination.policy.ts';

export type InvitationTokenService = Readonly<{
  issue: () => string;
  hash: (rawToken: string) => string;
}>;

export type IssueInvitationStoreInput = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  emailNormalized: string;
  displayName: string;
  intendedRole: WorkforceRole;
  intendedLocationId: string | null;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
  idempotencyKey: string;
  commandHash: string;
}>;

export type ReissueInvitationStoreInput = Readonly<{
  actor: WorkforceActorRef;
  invitationId: string;
  businessId: string;
  expectedVersion: number;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
  idempotencyKey: string;
  commandHash: string;
}>;

export type RevokeInvitationStoreInput = Readonly<{
  actor: WorkforceActorRef;
  invitationId: string;
  businessId: string;
  expectedVersion: number;
  reason: string | null;
  now: Date;
  idempotencyKey: string;
  commandHash: string;
}>;

export type AcceptInvitationStoreInput = Readonly<{
  tokenHash: string;
  now: Date;
  idempotencyKey: string;
  commandHash: string;
  acceptance:
    | Readonly<{
        kind: 'new_identity';
        passwordHash: string;
      }>
    | Readonly<{
        kind: 'existing_identity';
        authenticatedIdentityId: string;
        authenticatedSessionId: string;
      }>;
}>;

export type AcceptedInvitation = Readonly<{
  invitation: WorkforceInvitationSummary;
  identityId: string;
  membershipId: string;
  identityCreated: boolean;
  privilegedAccessEffective: boolean;
}>;

export type InvitationPreviewStoreResult =
  | Readonly<{
      status: 'available';
      value: WorkforceInvitationPreview;
    }>
  | Readonly<{
      status: 'rejected';
      reason: 'invalid_token' | 'expired_token' | 'invalid_state';
    }>;

export type WorkforceInvitationStore = Readonly<{
  issue: (
    input: IssueInvitationStoreInput,
  ) => Promise<
    Result<StoreMutationResult<WorkforceInvitationSummary>, AppError>
  >;
  reissue: (
    input: ReissueInvitationStoreInput,
  ) => Promise<
    Result<StoreMutationResult<WorkforceInvitationSummary>, AppError>
  >;
  revoke: (
    input: RevokeInvitationStoreInput,
  ) => Promise<
    Result<StoreMutationResult<WorkforceInvitationSummary>, AppError>
  >;
  preview: (
    tokenHash: string,
    now: Date,
  ) => Promise<Result<InvitationPreviewStoreResult, AppError>>;
  accept: (
    input: AcceptInvitationStoreInput,
  ) => Promise<Result<StoreMutationResult<AcceptedInvitation>, AppError>>;
  list: (input: {
    actor: WorkforceActorRef;
    businessId: string;
    includeTerminal: boolean;
    limit: number;
    cursor?: WorkforceCursor;
    now: Date;
  }) => Promise<
    Result<
      | Readonly<{
          status: 'found';
          invitations: readonly WorkforceInvitationSummary[];
          nextCursor: string | null;
        }>
      | Readonly<{
          status: 'rejected';
          reason: StoreFailureReason;
        }>,
      AppError
    >
  >;
}>;

export type WorkforceClock = Readonly<{ now: () => Date }>;
