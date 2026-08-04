import type { ControlHttpClient } from "@/api/control-http-client"
import {
  grantAccessResultSchema,
  invitationMutationResultSchema,
  issueInvitationResultSchema,
  membershipMutationResultSchema,
  revokeAccessResultSchema,
  workforceInvitationPageSchema,
  workforceMemberDetailSchema,
  workforcePageSchema,
  workforceSessionListSchema,
  workforceSessionRevokeResultSchema,
  type IssueInvitationResult,
  type WorkforceInvitation,
  type WorkforceMemberDetail,
  type WorkforceRole,
} from "./team-model"

export type ControlTeamApi = Readonly<{
  listMembers: () => Promise<{
    members: readonly import("./team-model").WorkforceMember[]
    nextCursor: string | null
  }>
  getMember: (membershipId: string) => Promise<WorkforceMemberDetail>
  listMemberSessions: (membershipId: string) => Promise<{
    sessions: readonly import("./team-model").WorkforceSession[]
  }>
  revokeMemberSessions: (input: {
    membershipId: string
    sessionId?: string
  }) => Promise<{ revokedCount: number; replayed: boolean }>
  listInvitations: () => Promise<{
    invitations: readonly WorkforceInvitation[]
    nextCursor: string | null
  }>
  issueInvitation: (input: {
    email: string
    displayName: string
    intendedRole: WorkforceRole
    intendedLocationId: string | null
  }) => Promise<IssueInvitationResult>
  reissueInvitation: (
    invitation: Pick<WorkforceInvitation, "id" | "version">,
  ) => Promise<IssueInvitationResult>
  revokeInvitation: (
    invitation: Pick<WorkforceInvitation, "id" | "version">,
  ) => Promise<WorkforceInvitation>
  transitionMember: (input: {
    action: "suspend" | "reactivate" | "end"
    membershipId: string
    expectedVersion: number
    reason?: string
  }) => Promise<{
    member: WorkforceMemberDetail
    revokedSessionCount: number
  }>
  grantAccess: (input: {
    membershipId: string
    identityId: string
    role: WorkforceRole
    scope: { kind: "business"; id: string } | { kind: "location"; id: string }
  }) => Promise<import("./team-model").AccessGrant>
  revokeAccess: (input: {
    grantId: string
    expectedVersion: number
    reason?: string
  }) => Promise<{
    grant: import("./team-model").AccessGrant
    revokedSessionCount: number
  }>
}>

const idempotencyKey = () => crypto.randomUUID()

export function makeControlTeamApi(client: ControlHttpClient): ControlTeamApi {
  return {
    listMembers: () =>
      client.request({ path: "/control/team?limit=100" }, workforcePageSchema),
    getMember: (membershipId) =>
      client.request(
        { path: `/control/team/${encodeURIComponent(membershipId)}` },
        workforceMemberDetailSchema,
      ),
    listMemberSessions: (membershipId) =>
      client.request(
        {
          path: `/control/team/${encodeURIComponent(membershipId)}/sessions`,
        },
        workforceSessionListSchema,
      ),
    revokeMemberSessions: (input) =>
      client.request(
        {
          method: "POST",
          path: `/control/team/${encodeURIComponent(input.membershipId)}/sessions/revoke`,
          csrf: true,
          body: {
            idempotencyKey: idempotencyKey(),
            ...(input.sessionId === undefined
              ? {}
              : { sessionId: input.sessionId }),
          },
        },
        workforceSessionRevokeResultSchema,
      ),
    listInvitations: () =>
      client.request(
        { path: "/control/invitations?limit=100" },
        workforceInvitationPageSchema,
      ),
    issueInvitation: (input) =>
      client.request(
        {
          method: "POST",
          path: "/control/invitations",
          csrf: true,
          body: { ...input, idempotencyKey: idempotencyKey() },
        },
        issueInvitationResultSchema,
      ),
    reissueInvitation: (invitation) =>
      client.request(
        {
          method: "POST",
          path: `/control/invitations/${encodeURIComponent(invitation.id)}/reissue`,
          csrf: true,
          body: {
            idempotencyKey: idempotencyKey(),
            expectedVersion: invitation.version,
          },
        },
        issueInvitationResultSchema,
      ),
    revokeInvitation: (invitation) =>
      client.request(
        {
          method: "POST",
          path: `/control/invitations/${encodeURIComponent(invitation.id)}/revoke`,
          csrf: true,
          body: {
            idempotencyKey: idempotencyKey(),
            expectedVersion: invitation.version,
            reason: "Access is no longer needed.",
          },
        },
        invitationMutationResultSchema,
      ),
    transitionMember: (input) =>
      client.request(
        {
          method: "POST",
          path: `/control/team/${encodeURIComponent(input.membershipId)}/${input.action}`,
          csrf: true,
          body: {
            idempotencyKey: idempotencyKey(),
            expectedVersion: input.expectedVersion,
            ...(input.reason === undefined ? {} : { reason: input.reason }),
          },
        },
        membershipMutationResultSchema,
      ),
    grantAccess: (input) =>
      client.request(
        {
          method: "POST",
          path: `/control/team/${encodeURIComponent(input.membershipId)}/grants`,
          csrf: true,
          body: {
            idempotencyKey: idempotencyKey(),
            identityId: input.identityId,
            role: input.role,
            scope: input.scope,
          },
        },
        grantAccessResultSchema,
      ),
    revokeAccess: (input) =>
      client.request(
        {
          method: "POST",
          path: `/control/grants/${encodeURIComponent(input.grantId)}/revoke`,
          csrf: true,
          body: {
            idempotencyKey: idempotencyKey(),
            expectedVersion: input.expectedVersion,
            ...(input.reason === undefined ? {} : { reason: input.reason }),
          },
        },
        revokeAccessResultSchema,
      ),
  }
}
