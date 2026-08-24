import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlWorkforceFailureSchema } from "../../../management/model/failure.ts"
import {
  revokeSessionsInputSchema,
  sessionRevocationSchema,
} from "../../../management/workforce/contracts.ts"

export const revokeControlMemberSessionsContract =
  defineControlManagementContract({
    label: "control.revoke-member-sessions.v1",
    input: revokeSessionsInputSchema,
    output: sessionRevocationSchema,
    failure: controlWorkforceFailureSchema,
  })
