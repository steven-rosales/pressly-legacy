import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlWorkforceFailureSchema } from "../../../management/model/failure.ts"
import {
  revokeAccessInputSchema,
  revokeAccessOutputSchema,
} from "../../../management/workforce/contracts.ts"

export const revokeControlAccessContract = defineControlManagementContract({
  label: "control.revoke-access.v1",
  input: revokeAccessInputSchema,
  output: revokeAccessOutputSchema,
  failure: controlWorkforceFailureSchema,
})
