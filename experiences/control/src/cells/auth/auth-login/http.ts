import type {
  ControlLoginFailure,
  ControlLoginOutput,
} from "../../../auth/model/schemas.ts"
import { encodeControlAuthValue } from "../../../auth/model/boundary-contract.ts"
import {
  parsedBody,
  requestMetadata,
  validateBody,
} from "../../../auth/model/http.ts"
import { presentControlBrowser } from "../../../auth/model/presentation.ts"
import {
  controlLoginDataSchema,
  loginBodySchema,
} from "../../../auth/model/schemas.ts"
import { http } from "@pressly/cells"

export const loginSurface = http.post<ControlLoginOutput, ControlLoginFailure>({
  path: "/control/auth/login",
  bodyLimit: "8kb",
  contextRequirements: ["request-metadata"],
  invalidRequest: {
    input: {
      code: "invalid_body_type",
      message: "Validation body failed.",
      location: "body",
    },
  },
  validateRequest: validateBody(loginBodySchema),
  toSerializedInput: (request) => ({
    ...parsedBody(request, loginBodySchema),
    ...requestMetadata(request),
  }),
  present: (outcome) =>
    presentControlBrowser("control.auth-login.v1", outcome, (data) =>
      encodeControlAuthValue(controlLoginDataSchema, data, "login"),
    ),
})
