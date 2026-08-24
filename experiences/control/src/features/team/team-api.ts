import type {
  ControlAccessGrantProjection,
  ControlIssueInvitationResult,
  ControlWorkforceInvitationProjection,
  ControlWorkforceMemberDetailProjection,
  ControlWorkforceMemberProjection,
  ControlWorkforceSession,
  WorkforceRole,
} from "../../browser/contracts/workforce.ts"

export type ControlTeamApi = Readonly<{
  listMembers: () => Promise<
    Readonly<{
      members: readonly ControlWorkforceMemberProjection[]
      nextCursor: string | null
    }>
  >
  getMember: (
    membershipId: string,
  ) => Promise<ControlWorkforceMemberDetailProjection>
  listMemberSessions: (membershipId: string) => Promise<
    Readonly<{
      sessions: readonly ControlWorkforceSession[]
    }>
  >
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
      scope: ControlAccessGrantProjection["scope"]
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
