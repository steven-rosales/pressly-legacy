import {
  controlAccessGrantProjectionSchema,
  controlIssueInvitationResultSchema,
  controlMembershipMutationResultSchema,
  controlRevokeAccessResultSchema,
  controlWorkforceInvitationPageSchema,
  controlWorkforceInvitationProjectionSchema,
  controlWorkforceMemberDetailProjectionSchema,
  controlWorkforceMemberPageSchema,
  controlWorkforceSessionListSchema,
  controlWorkforceSessionRevokeResultSchema,
} from "../contracts/workforce.ts"
import {
  appendBrowserQuery,
  renderBrowserPath,
  strictWireCodec,
  type BrowserHttpSurface,
  type ControlBrowserRequestTransport,
} from "../transport.ts"
import type {
  ControlWorkforceBrowserClient,
  ControlWorkforceOperations,
} from "./types.ts"

const memberPageCodec = strictWireCodec(controlWorkforceMemberPageSchema)
const memberDetailCodec = strictWireCodec(
  controlWorkforceMemberDetailProjectionSchema,
)
const sessionListCodec = strictWireCodec(controlWorkforceSessionListSchema)
const sessionRevokeCodec = strictWireCodec(
  controlWorkforceSessionRevokeResultSchema,
)
const invitationPageCodec = strictWireCodec(
  controlWorkforceInvitationPageSchema,
)
const issueInvitationCodec = strictWireCodec(controlIssueInvitationResultSchema)
const invitationMutationCodec = strictWireCodec(
  controlWorkforceInvitationProjectionSchema,
)
const membershipMutationCodec = strictWireCodec(
  controlMembershipMutationResultSchema,
)
const grantAccessCodec = strictWireCodec(controlAccessGrantProjectionSchema)
const revokeAccessCodec = strictWireCodec(controlRevokeAccessResultSchema)

const optionalReason = (reason: string | undefined) =>
  reason === undefined ? {} : { reason }

export const makeControlWorkforceBrowserClient = (
  input: Readonly<{
    operations: ControlWorkforceOperations
    request: ControlBrowserRequestTransport
    idempotencyKey: () => string
  }>,
): ControlWorkforceBrowserClient => {
  const transition = (
    action: "suspend" | "reactivate" | "end",
  ): BrowserHttpSurface<"POST"> => {
    if (action === "suspend")
      return input.operations.suspendMembership.http.suspend
    if (action === "reactivate")
      return input.operations.reactivateMembership.http.reactivate
    return input.operations.endMembership.http.end
  }

  return Object.freeze({
    listMembers: () => {
      const surface = input.operations.listMembers.http.team
      return input.request(
        {
          method: surface.method,
          path: appendBrowserQuery(surface.path, [["limit", 100]]),
        },
        memberPageCodec,
      )
    },
    getMember: (membershipId) => {
      const surface = input.operations.getMember.http.request
      return input.request(
        {
          method: surface.method,
          path: renderBrowserPath(surface.path, { membershipId }),
        },
        memberDetailCodec,
      )
    },
    listMemberSessions: (membershipId) => {
      const surface = input.operations.listMemberSessions.http.sessions
      return input.request(
        {
          method: surface.method,
          path: renderBrowserPath(surface.path, { membershipId }),
        },
        sessionListCodec,
      )
    },
    revokeMemberSessions: ({ membershipId, sessionId }) => {
      const surface = input.operations.revokeMemberSessions.http.revoke
      return input.request(
        {
          method: surface.method,
          path: renderBrowserPath(surface.path, { membershipId }),
          csrf: true,
          body: {
            idempotencyKey: input.idempotencyKey(),
            ...(sessionId === undefined ? {} : { sessionId }),
          },
        },
        sessionRevokeCodec,
      )
    },
    listInvitations: () => {
      const surface = input.operations.listInvitations.http.invitations
      return input.request(
        {
          method: surface.method,
          path: appendBrowserQuery(surface.path, [["limit", 100]]),
        },
        invitationPageCodec,
      )
    },
    issueInvitation: (invitation) => {
      const surface = input.operations.issueInvitation.http.invitations
      return input.request(
        {
          method: surface.method,
          path: surface.path,
          csrf: true,
          body: { ...invitation, idempotencyKey: input.idempotencyKey() },
        },
        issueInvitationCodec,
      )
    },
    reissueInvitation: (invitation) => {
      const surface = input.operations.reissueInvitation.http.reissue
      return input.request(
        {
          method: surface.method,
          path: renderBrowserPath(surface.path, {
            invitationId: invitation.id,
          }),
          csrf: true,
          body: {
            idempotencyKey: input.idempotencyKey(),
            expectedVersion: invitation.version,
          },
        },
        issueInvitationCodec,
      )
    },
    revokeInvitation: (invitation) => {
      const surface = input.operations.revokeInvitation.http.revoke
      return input.request(
        {
          method: surface.method,
          path: renderBrowserPath(surface.path, {
            invitationId: invitation.id,
          }),
          csrf: true,
          body: {
            idempotencyKey: input.idempotencyKey(),
            expectedVersion: invitation.version,
            reason: "Access is no longer needed.",
          },
        },
        invitationMutationCodec,
      )
    },
    transitionMember: ({ action, membershipId, expectedVersion, reason }) => {
      const surface = transition(action)
      return input.request(
        {
          method: surface.method,
          path: renderBrowserPath(surface.path, { membershipId }),
          csrf: true,
          body: {
            idempotencyKey: input.idempotencyKey(),
            expectedVersion,
            ...optionalReason(reason),
          },
        },
        membershipMutationCodec,
      )
    },
    grantAccess: ({ membershipId, identityId, role, scope }) => {
      const surface = input.operations.grantAccess.http.grants
      return input.request(
        {
          method: surface.method,
          path: renderBrowserPath(surface.path, { membershipId }),
          csrf: true,
          body: {
            idempotencyKey: input.idempotencyKey(),
            identityId,
            role,
            scope,
          },
        },
        grantAccessCodec,
      )
    },
    revokeAccess: ({ grantId, expectedVersion, reason }) => {
      const surface = input.operations.revokeAccess.http.revoke
      return input.request(
        {
          method: surface.method,
          path: renderBrowserPath(surface.path, { grantId }),
          csrf: true,
          body: {
            idempotencyKey: input.idempotencyKey(),
            expectedVersion,
            ...optionalReason(reason),
          },
        },
        revokeAccessCodec,
      )
    },
  })
}
