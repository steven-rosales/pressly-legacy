import {
  invitationAcceptanceSchema,
  invitationAcceptBodySchema,
  invitationAcceptanceFailureSchema,
} from "../../../management/invitations/contracts.ts"
import { defineControlManagementContract } from "../../../management/model/boundary.ts"

export const acceptNewControlInvitationContract =
  defineControlManagementContract({
    label: "control.accept-new-invitation.v1",
    input: invitationAcceptBodySchema,
    output: invitationAcceptanceSchema,
    failure: invitationAcceptanceFailureSchema,
  })
