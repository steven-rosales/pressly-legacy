import {
  acceptExistingPasswordInputSchema,
  invitationBootstrapOutputSchema,
  invitationFailureSchema,
} from "../../../management/invitations/contracts.ts"
import { defineControlManagementContract } from "../../../management/model/boundary.ts"

export const acceptExistingPasswordContract = defineControlManagementContract({
  label: "control.accept-existing-invitation-password.v1",
  input: acceptExistingPasswordInputSchema,
  output: invitationBootstrapOutputSchema,
  failure: invitationFailureSchema,
})
