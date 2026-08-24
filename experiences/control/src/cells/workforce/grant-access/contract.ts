import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlWorkforceFailureSchema } from "../../../management/model/failure.ts"
import {
  grantAccessInputSchema,
  grantProjectionSchema,
} from "../../../management/workforce/contracts.ts"

export const grantControlAccessContract = defineControlManagementContract({
  label: "control.grant-access.v1",
  input: grantAccessInputSchema,
  output: grantProjectionSchema,
  failure: controlWorkforceFailureSchema,
})
