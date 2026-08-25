import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlWorkforceFailureSchema } from "../../../management/model/failure.ts"
import {
  invitationMutationInputSchema,
  invitationProjectionSchema,
} from "../../../management/workforce/contracts.ts"

export const revokeControlInvitationContract = defineControlManagementContract({
  label: "control.revoke-invitation.v1",
  input: invitationMutationInputSchema,
  output: invitationProjectionSchema,
  failure: controlWorkforceFailureSchema,
})
