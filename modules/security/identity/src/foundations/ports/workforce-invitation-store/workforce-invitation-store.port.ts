import type { WorkforceCursor } from '../../language/workforce-pagination/workforce-cursor.value.ts';
import type {
  StoreFailureReason,
  StoreMutationResult,
  WorkforceActorRef,
  WorkforceRole,
} from '../../language/workforce/workforce.model.ts';
import type {
  WorkforceInvitationPreview,
  WorkforceInvitationSummary,
} from '../../language/workforce-invitation/workforce-invitation.model.ts';

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

export type ListInvitationsStoreInput = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  includeTerminal: boolean;
  limit: number;
  cursor?: WorkforceCursor;
  now: Date;
}>;

export type ListInvitationsStoreResult =
  | Readonly<{
      status: 'found';
      invitations: readonly WorkforceInvitationSummary[];
      nextCursor: string | null;
    }>
  | Readonly<{
      status: 'rejected';
      reason: StoreFailureReason;
    }>;

export type WorkforceInvitationStore = Readonly<{
  issue: (
    input: IssueInvitationStoreInput,
  ) => Promise<StoreMutationResult<WorkforceInvitationSummary>>;
  reissue: (
    input: ReissueInvitationStoreInput,
  ) => Promise<StoreMutationResult<WorkforceInvitationSummary>>;
  revoke: (
    input: RevokeInvitationStoreInput,
  ) => Promise<StoreMutationResult<WorkforceInvitationSummary>>;
  preview: (
    tokenHash: string,
    now: Date,
  ) => Promise<InvitationPreviewStoreResult>;
  accept: (
    input: AcceptInvitationStoreInput,
  ) => Promise<StoreMutationResult<AcceptedInvitation>>;
  list: (
    input: ListInvitationsStoreInput,
  ) => Promise<ListInvitationsStoreResult>;
}>;
