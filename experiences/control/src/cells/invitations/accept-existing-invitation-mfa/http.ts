import type {
  InvitationBootstrapOutput,
  InvitationAcceptanceFailure,
} from "../../../management/invitations/contracts.ts"
import type { HttpRequest } from "@pressly/cells"
import { encodeControlAuthValue } from "../../../auth/model/boundary-contract.ts"
import {
  parsedBody,
  requestId,
  validateBody,
} from "../../../auth/model/http.ts"
import {
  existingMfaBodySchema,
  invitationBootstrapDataSchema,
} from "../../../management/invitations/contracts.ts"
import { presentInvitationBrowser } from "../../../management/invitations/failure.ts"
import { http } from "@pressly/cells"
import { authError } from "@pressly/errors/factories"

export const invitationChallengeToken = (request: HttpRequest): string => {
  const context = request.context
  const value =
    typeof context === "object" && context !== null && !Array.isArray(context)
      ? Reflect.get(context, "challengeToken")
      : undefined
  if (typeof value === "string" && value.length > 0) return value
  throw authError({
    code: "invitation_mfa_challenge_missing",
    message: "Invitation MFA challenge cookie is missing.",
    safeMessage: "Authentication is required.",
  })
}

export const mfaSurface = http.post<
  InvitationBootstrapOutput,
  InvitationAcceptanceFailure
>({
  path: "/control/invitations/accept/existing/mfa",
  bodyLimit: "8kb",
  contextRequirements: ["control-mfa-cookie", "request-metadata"],
  invalidRequest: {
    input: {
      code: "invalid_body_type",
      message: "Validation body failed.",
      location: "body",
    },
  },
  validateRequest: validateBody(existingMfaBodySchema),
  toSerializedInput: (request) => ({
    ...parsedBody(request, existingMfaBodySchema),
    challengeToken: invitationChallengeToken(request),
    ...(requestId(request) === undefined
      ? {}
      : { requestId: requestId(request) }),
  }),
  present: (outcome) =>
    presentInvitationBrowser(outcome, (data) =>
      encodeControlAuthValue(
        invitationBootstrapDataSchema,
        data,
        "invitation MFA bootstrap",
      ),
    ),
})
