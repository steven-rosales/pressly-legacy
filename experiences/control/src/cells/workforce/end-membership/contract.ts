import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlWorkforceFailureSchema } from "../../../management/model/failure.ts"
import {
  membershipTransitionInputSchema,
  membershipTransitionOutputSchema,
} from "../../../management/workforce/contracts.ts"

export const endControlMembershipContract = defineControlManagementContract({
  label: "control.end-membership.v1",
  input: membershipTransitionInputSchema,
  output: membershipTransitionOutputSchema,
  failure: controlWorkforceFailureSchema,
})
