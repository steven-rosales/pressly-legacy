import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlWorkforceFailureSchema } from "../../../management/model/failure.ts"
import {
  issueInvitationInputSchema,
  issueInvitationOutputSchema,
} from "../../../management/workforce/contracts.ts"

export const issueControlInvitationContract = defineControlManagementContract({
  label: "control.issue-invitation.v1",
  input: issueInvitationInputSchema,
  output: issueInvitationOutputSchema,
  failure: controlWorkforceFailureSchema,
})
