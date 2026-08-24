import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlWorkforceFailureSchema } from "../../../management/model/failure.ts"
import {
  listMembersInputSchema,
  memberPageSchema,
} from "../../../management/workforce/contracts.ts"

export const listControlMembersContract = defineControlManagementContract({
  label: "control.list-members.v1",
  input: listMembersInputSchema,
  output: memberPageSchema,
  failure: controlWorkforceFailureSchema,
})
