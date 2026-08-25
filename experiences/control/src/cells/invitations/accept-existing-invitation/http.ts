import type {
  InvitationAcceptance,
  InvitationAcceptanceFailure,
} from "../../../management/invitations/contracts.ts"
import { parsedBody, validateBody } from "../../../auth/model/http.ts"
import { invitationAcceptBodySchema } from "../../../management/invitations/contracts.ts"
import { presentInvitationValue } from "../../../management/invitations/failure.ts"
import { controlManagementContext } from "../../../management/model/context.ts"
import { acceptExistingControlInvitationContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const acceptExistingSurface = http.post<
  InvitationAcceptance,
  InvitationAcceptanceFailure
>({
  path: "/control/invitations/accept/existing",
  bodyLimit: "8kb",
  contextRequirements: ["control-request-context"],
  invalidRequest: {
    input: {
      code: "invalid_body_type",
      message: "Validation body failed.",
      location: "body",
    },
  },
  validateRequest: validateBody(invitationAcceptBodySchema),
  toSerializedInput: (request) => ({
    ...parsedBody(request, invitationAcceptBodySchema),
    context: controlManagementContext(request),
  }),
  present: (outcome) =>
    presentInvitationValue(
      outcome,
      acceptExistingControlInvitationContract.output.encode,
    ),
})
