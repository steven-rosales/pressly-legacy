import type { AccessManagementExecute } from "../../../management/model/dependencies.ts"
import type { InvitationProjection } from "../../../management/workforce/contracts.ts"
import { workforceFailure } from "../../../management/model/failure.ts"
import { revokeControlInvitationCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

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

export const makeRevokeControlInvitationCell = (
  access: AccessManagementExecute<"revokeWorkforceInvitation">,
) =>
  bindCell(revokeControlInvitationCellDeclaration, async (input) => {
    const outcome = await access.execute({
      actor: input.context.actor,
      businessId: input.context.access.business.id,
      invitationId: input.invitationId,
      expectedVersion: input.expectedVersion,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      idempotencyKey: input.idempotencyKey,
    })
    return outcome.kind === "failure"
      ? { kind: "failure", failure: workforceFailure(outcome.failure) }
      : { kind: "success", value: projectControlInvitation(outcome.value) }
  })
