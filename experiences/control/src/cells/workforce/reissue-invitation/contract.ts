import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlWorkforceFailureSchema } from "../../../management/model/failure.ts"
import {
  invitationMutationInputSchema,
  issueInvitationOutputSchema,
} from "../../../management/workforce/contracts.ts"

export const reissueControlInvitationContract = defineControlManagementContract(
  {
    label: "control.reissue-invitation.v1",
    input: invitationMutationInputSchema,
    output: issueInvitationOutputSchema,
    failure: controlWorkforceFailureSchema,
  },
)
