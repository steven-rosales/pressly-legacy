import {
  invitationPreviewFailureSchema,
  invitationPreviewBodySchema,
  invitationPreviewSchema,
} from "../../../management/invitations/contracts.ts"
import { defineControlManagementContract } from "../../../management/model/boundary.ts"

export const previewControlInvitationContract = defineControlManagementContract(
  {
    label: "control.preview-invitation.v1",
    input: invitationPreviewBodySchema,
    output: invitationPreviewSchema,
    failure: invitationPreviewFailureSchema,
  },
)
