import type { AccessExecute } from "../../../auth/model/access.ts"
import type { InvitationPreview } from "../../../management/invitations/contracts.ts"
import { invitationPeerFailure } from "../../../management/invitations/failure.ts"
import { previewControlInvitationCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

type PreviewExecute = AccessExecute<"previewWorkforceInvitation">

type RawPreview = Extract<
  Awaited<ReturnType<PreviewExecute["execute"]>>,
  Readonly<{
    kind: "success"
  }>
>["value"]

const projectPreview = (value: RawPreview): InvitationPreview => ({
  invitationId: value.invitationId,
  business: { id: value.businessId, name: value.businessName },
  email: value.emailNormalized,
  displayName: value.displayName,
  intendedRole: value.intendedRole,
  intendedLocationId: value.intendedLocationId,
  expiresAt: value.expiresAt,
  existingIdentity: value.existingIdentity,
})

export const makePreviewControlInvitationCell = (access: PreviewExecute) =>
  defineOperation(previewControlInvitationCellDeclaration, async (input) => {
    const outcome = await access.execute(input.acceptanceToken)
    return outcome.kind === "failure"
      ? { kind: "failure", failure: invitationPeerFailure(outcome.failure) }
      : { kind: "success", value: projectPreview(outcome.value) }
  })
