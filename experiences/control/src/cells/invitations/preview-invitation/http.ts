import type {
  InvitationPreviewFailure,
  InvitationPreview,
} from "../../../management/invitations/contracts.ts"
import { parsedBody, validateBody } from "../../../auth/model/http.ts"
import { invitationPreviewBodySchema } from "../../../management/invitations/contracts.ts"
import { presentInvitationValue } from "../../../management/invitations/failure.ts"
import { previewControlInvitationContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const previewSurface = http.post<
  InvitationPreview,
  InvitationPreviewFailure
>({
  path: "/control/invitations/preview",
  bodyLimit: "8kb",
  invalidRequest: {
    input: {
      code: "invalid_body_type",
      message: "Validation body failed.",
      location: "body",
    },
  },
  validateRequest: validateBody(invitationPreviewBodySchema),
  toSerializedInput: (request) =>
    parsedBody(request, invitationPreviewBodySchema),
  present: (outcome) =>
    presentInvitationValue(
      outcome,
      previewControlInvitationContract.output.encode,
    ),
})
