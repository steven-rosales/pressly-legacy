import {
  acceptExistingMfaInputSchema,
  invitationBootstrapOutputSchema,
  invitationAcceptanceFailureSchema,
} from "../../../management/invitations/contracts.ts"
import { defineControlManagementContract } from "../../../management/model/boundary.ts"

export const acceptExistingMfaContract = defineControlManagementContract({
  label: "control.accept-existing-invitation-mfa.v1",
  input: acceptExistingMfaInputSchema,
  output: invitationBootstrapOutputSchema,
  failure: invitationAcceptanceFailureSchema,
})
