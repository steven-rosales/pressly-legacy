import { defineControlManagementContract } from "../../../management/model/boundary.ts"
import { controlWorkforceFailureSchema } from "../../../management/model/failure.ts"
import {
  invitationPageSchema,
  listInvitationsInputSchema,
} from "../../../management/workforce/contracts.ts"

export const listControlInvitationsContract = defineControlManagementContract({
  label: "control.list-invitations.v1",
  input: listInvitationsInputSchema,
  output: invitationPageSchema,
  failure: controlWorkforceFailureSchema,
})
