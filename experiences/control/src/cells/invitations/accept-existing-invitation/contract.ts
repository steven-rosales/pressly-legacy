import {
  acceptExistingInvitationInputSchema,
  invitationAcceptanceSchema,
  invitationAcceptanceFailureSchema,
} from "../../../management/invitations/contracts.ts"
import { defineControlManagementContract } from "../../../management/model/boundary.ts"

export const acceptExistingControlInvitationContract =
  defineControlManagementContract({
    label: "control.accept-existing-invitation.v1",
    input: acceptExistingInvitationInputSchema,
    output: invitationAcceptanceSchema,
    failure: invitationAcceptanceFailureSchema,
  })
