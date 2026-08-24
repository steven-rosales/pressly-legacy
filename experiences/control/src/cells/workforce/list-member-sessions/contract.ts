import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlWorkforceFailureSchema } from "../../../management/model/failure.ts"
import {
  memberInputSchema,
  sessionListSchema,
} from "../../../management/workforce/contracts.ts"

export const listControlMemberSessionsContract =
  defineControlManagementContract({
    label: "control.list-member-sessions.v1",
    input: memberInputSchema,
    output: sessionListSchema,
    failure: controlWorkforceFailureSchema,
  })
