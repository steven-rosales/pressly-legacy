import type {
  ControlSessionFailure,
  ControlSessionOutput,
} from "../../../auth/model/schemas.ts"
import { encodeControlAuthValue } from "../../../auth/model/boundary-contract.ts"
import {
  controlChallengeToken,
  parsedBody,
  requestId,
  validateBody,
} from "../../../auth/model/http.ts"
import { presentControlBrowser } from "../../../auth/model/presentation.ts"
import {
  controlLoginDataSchema,
  cookieChallengeBodySchema,
} from "../../../auth/model/schemas.ts"
import { http } from "@pressly/cells"

export const challengeSurface = http.post<
  ControlSessionOutput,
  ControlSessionFailure
>({
  path: "/control/auth/mfa/challenge",
  bodyLimit: "4kb",
  contextRequirements: ["control-mfa-cookie", "request-metadata"],
  invalidRequest: {
    input: {
      code: "invalid_body_type",
      message: "Validation body failed.",
      location: "body",
    },
  },
  validateRequest: validateBody(cookieChallengeBodySchema),
  toSerializedInput: (request) => ({
    ...parsedBody(request, cookieChallengeBodySchema),
    challengeToken: controlChallengeToken(request),
    ...(requestId(request) === undefined
      ? {}
      : { requestId: requestId(request) }),
  }),
  present: (outcome) =>
    presentControlBrowser(
      "control.complete-mfa-challenge.v1",
      outcome,
      (data) =>
        encodeControlAuthValue(
          controlLoginDataSchema.options[0],
          data,
          "MFA challenge",
        ),
    ),
})
