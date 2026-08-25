import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlWorkforceFailureSchema } from "../../../management/model/failure.ts"
import {
  membershipTransitionInputSchema,
  membershipTransitionOutputSchema,
} from "../../../management/workforce/contracts.ts"

export const reactivateControlMembershipContract =
  defineControlManagementContract({
    label: "control.reactivate-membership.v1",
    input: membershipTransitionInputSchema,
    output: membershipTransitionOutputSchema,
    failure: controlWorkforceFailureSchema,
  })
