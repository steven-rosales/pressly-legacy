import type {
  ControlAccessGrantProjection,
  ControlIssueInvitationResult,
  ControlWorkforceInvitationProjection,
  ControlWorkforceMemberDetailProjection,
  ControlWorkforceMemberProjection,
  ControlWorkforceSession,
  WorkforceRole,
} from "../contracts/workforce.ts"
import type {
  BrowserHttpSurface,
  GeneratedBrowserOperation,
} from "../transport.ts"

export type ControlWorkforceOperations = Readonly<{
  listMembers: GeneratedBrowserOperation<
    "control.list-members.v1",
    Readonly<{ team: BrowserHttpSurface<"GET"> }>
  >
  getMember: GeneratedBrowserOperation<
    "control.get-member.v1",
    Readonly<{ request: BrowserHttpSurface<"GET"> }>
  >
  listMemberSessions: GeneratedBrowserOperation<
    "control.list-member-sessions.v1",
    Readonly<{ sessions: BrowserHttpSurface<"GET"> }>
  >
  revokeMemberSessions: GeneratedBrowserOperation<
    "control.revoke-member-sessions.v1",
    Readonly<{ revoke: BrowserHttpSurface<"POST"> }>
  >
  listInvitations: GeneratedBrowserOperation<
    "control.list-invitations.v1",
    Readonly<{ invitations: BrowserHttpSurface<"GET"> }>
  >
  issueInvitation: GeneratedBrowserOperation<
    "control.issue-invitation.v1",
    Readonly<{ invitations: BrowserHttpSurface<"POST"> }>
  >
  reissueInvitation: GeneratedBrowserOperation<
    "control.reissue-invitation.v1",
    Readonly<{ reissue: BrowserHttpSurface<"POST"> }>
  >
  revokeInvitation: GeneratedBrowserOperation<
    "control.revoke-invitation.v1",
    Readonly<{ revoke: BrowserHttpSurface<"POST"> }>
  >
  suspendMembership: GeneratedBrowserOperation<
    "control.suspend-membership.v1",
    Readonly<{ suspend: BrowserHttpSurface<"POST"> }>
  >
  reactivateMembership: GeneratedBrowserOperation<
    "control.reactivate-membership.v1",
    Readonly<{ reactivate: BrowserHttpSurface<"POST"> }>
  >
  endMembership: GeneratedBrowserOperation<
    "control.end-membership.v1",
    Readonly<{ end: BrowserHttpSurface<"POST"> }>
  >
  grantAccess: GeneratedBrowserOperation<
    "control.grant-access.v1",
    Readonly<{ grants: BrowserHttpSurface<"POST"> }>
  >
  revokeAccess: GeneratedBrowserOperation<
    "control.revoke-access.v1",
    Readonly<{ revoke: BrowserHttpSurface<"POST"> }>
  >
}>

export type WorkforceScope = ControlAccessGrantProjection["scope"]

export type ControlWorkforceBrowserClient = Readonly<{
  listMembers: () => Promise<
    Readonly<{
      members: readonly ControlWorkforceMemberProjection[]
      nextCursor: string | null
    }>
  >
  getMember: (
    membershipId: string,
  ) => Promise<ControlWorkforceMemberDetailProjection>
  listMemberSessions: (
    membershipId: string,
  ) => Promise<Readonly<{ sessions: readonly ControlWorkforceSession[] }>>
  revokeMemberSessions: (
    input: Readonly<{
      membershipId: string
      sessionId?: string
    }>,
  ) => Promise<Readonly<{ revokedCount: number; replayed: boolean }>>
  listInvitations: () => Promise<
    Readonly<{
      invitations: readonly ControlWorkforceInvitationProjection[]
      nextCursor: string | null
    }>
  >
  issueInvitation: (
    input: Readonly<{
      email: string
      displayName: string
      intendedRole: WorkforceRole
      intendedLocationId: string | null
    }>,
  ) => Promise<ControlIssueInvitationResult>
  reissueInvitation: (
    invitation: Pick<ControlWorkforceInvitationProjection, "id" | "version">,
  ) => Promise<ControlIssueInvitationResult>
  revokeInvitation: (
    invitation: Pick<ControlWorkforceInvitationProjection, "id" | "version">,
  ) => Promise<ControlWorkforceInvitationProjection>
  transitionMember: (
    input: Readonly<{
      action: "suspend" | "reactivate" | "end"
      membershipId: string
      expectedVersion: number
      reason?: string
    }>,
  ) => Promise<
    Readonly<{
      member: ControlWorkforceMemberDetailProjection
      revokedSessionCount: number
    }>
  >
  grantAccess: (
    input: Readonly<{
      membershipId: string
      identityId: string
      role: WorkforceRole
      scope: WorkforceScope
    }>,
  ) => Promise<ControlAccessGrantProjection>
  revokeAccess: (
    input: Readonly<{
      grantId: string
      expectedVersion: number
      reason?: string
    }>,
  ) => Promise<
    Readonly<{
      grant: ControlAccessGrantProjection
      revokedSessionCount: number
    }>
  >
}>
