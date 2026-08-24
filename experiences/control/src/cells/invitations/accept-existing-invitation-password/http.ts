import type {
  InvitationBootstrapOutput,
  InvitationFailure,
} from "../../../management/invitations/contracts.ts"
import { encodeControlAuthValue } from "../../../auth/model/boundary-contract.ts"
import {
  parsedBody,
  requestMetadata,
  validateBody,
} from "../../../auth/model/http.ts"
import {
  existingPasswordBodySchema,
  invitationBootstrapDataSchema,
} from "../../../management/invitations/contracts.ts"
import { presentInvitationBrowser } from "../../../management/invitations/failure.ts"
import { http } from "@pressly/cells"

export const passwordSurface = http.post<
  InvitationBootstrapOutput,
  InvitationFailure
>({
  path: "/control/invitations/accept/existing/password",
  bodyLimit: "8kb",
  contextRequirements: ["request-metadata"],
  invalidRequest: {
    input: {
      code: "invalid_body_type",
      message: "Validation body failed.",
      location: "body",
    },
  },
  validateRequest: validateBody(existingPasswordBodySchema),
  toSerializedInput: (request) => ({
    ...parsedBody(request, existingPasswordBodySchema),
    ...requestMetadata(request),
  }),
  present: (outcome) =>
    presentInvitationBrowser(outcome, (data) =>
      encodeControlAuthValue(
        invitationBootstrapDataSchema,
        data,
        "invitation password bootstrap",
      ),
    ),
})
