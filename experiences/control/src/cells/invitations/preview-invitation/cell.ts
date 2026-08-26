import type {
  InvitationPreviewFailure,
  InvitationPreview,
  PreviewInvitationInput,
} from "../../../management/invitations/contracts.ts"
import { previewControlInvitationContract } from "./contract.ts"
import { previewSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const previewControlInvitationCellDeclaration = defineOperation<
  PreviewInvitationInput,
  InvitationPreview,
  InvitationPreviewFailure
>({
  kind: "query",
  id: "control.preview-invitation.v1",
  authentication: "none",
  contract: previewControlInvitationContract,
  consistency: { transaction: "none", concurrency: "none" },
  surfaces: [previewSurface],
  observability: { operation: "control.preview_invitation" },
})
