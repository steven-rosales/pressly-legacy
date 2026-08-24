import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlWorkforceFailureSchema } from "../../../management/model/failure.ts"
import {
  memberDetailSchema,
  memberInputSchema,
} from "../../../management/workforce/contracts.ts"

export const getControlMemberContract = defineControlManagementContract({
  label: "control.get-member.v1",
  input: memberInputSchema,
  output: memberDetailSchema,
  failure: controlWorkforceFailureSchema,
})
