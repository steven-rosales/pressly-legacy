import type {
  InvitationAcceptance,
  InvitationAcceptanceFailure,
} from "../../../management/invitations/contracts.ts"
import { parsedBody, validateBody } from "../../../auth/model/http.ts"
import { invitationAcceptBodySchema } from "../../../management/invitations/contracts.ts"
import { presentInvitationValue } from "../../../management/invitations/failure.ts"
import { acceptNewControlInvitationContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const acceptNewSurface = http.post<
  InvitationAcceptance,
  InvitationAcceptanceFailure
>({
  path: "/control/invitations/accept/new",
  bodyLimit: "8kb",
  invalidRequest: {
    input: {
      code: "invalid_body_type",
      message: "Validation body failed.",
      location: "body",
    },
  },
  validateRequest: validateBody(invitationAcceptBodySchema),
  toSerializedInput: (request) =>
    parsedBody(request, invitationAcceptBodySchema),
  present: (outcome) =>
    presentInvitationValue(
      outcome,
      acceptNewControlInvitationContract.output.encode,
      201,
    ),
})
