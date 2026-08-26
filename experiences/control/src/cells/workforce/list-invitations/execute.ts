import type { AccessManagementExecute } from "../../../management/model/dependencies.ts"
import type { InvitationProjection } from "../../../management/workforce/contracts.ts"
import { workforceFailure } from "../../../management/model/failure.ts"
import { listControlInvitationsCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

type RawInvitation = Readonly<{
  id: string
  businessId: string
  emailNormalized: string
  displayName: string
  intendedRole: "owner" | "manager" | "operator"
  intendedLocationId: string | null
  state: "pending" | "accepted" | "revoked" | "expired"
  version: number
  expiresAt: Date
  createdAt: Date
}>

export const projectControlInvitation = (
  invitation: RawInvitation,
): InvitationProjection => ({
  id: invitation.id,
  businessId: invitation.businessId,
  email: invitation.emailNormalized,
  displayName: invitation.displayName,
  intendedRole: invitation.intendedRole,
  intendedLocationId: invitation.intendedLocationId,
  state: invitation.state,
  version: invitation.version,
  expiresAt: invitation.expiresAt,
  createdAt: invitation.createdAt,
})

export const makeListControlInvitationsCell = (
  access: AccessManagementExecute<"listWorkforceInvitations">,
) =>
  defineOperation(listControlInvitationsCellDeclaration, async (input) => {
    const outcome = await access.execute({
      actor: input.context.actor,
      businessId: input.context.access.business.id,
      includeTerminal: input.includeTerminal,
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      limit: input.limit,
    })
    return outcome.kind === "failure"
      ? { kind: "failure", failure: workforceFailure(outcome.failure) }
      : {
          kind: "success",
          value: {
            invitations: outcome.value.invitations.map(
              projectControlInvitation,
            ),
            nextCursor: outcome.value.nextCursor,
          },
        }
  })
