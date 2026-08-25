import type {
  ControlSessionFailure,
  ControlSessionOutput,
} from "../../../auth/model/schemas.ts"
import { encodeControlAuthValue } from "../../../auth/model/boundary-contract.ts"
import { controlSessionToken, requestId } from "../../../auth/model/http.ts"
import { presentControlBrowser } from "../../../auth/model/presentation.ts"
import { controlLoginDataSchema } from "../../../auth/model/schemas.ts"
import { http } from "@pressly/cells"

export const sessionSurface = http.get<
  ControlSessionOutput,
  ControlSessionFailure
>({
  path: "/control/auth/session",
  bodyLimit: "16kb",
  contextRequirements: ["control-session-cookie", "request-metadata"],
  toSerializedInput: (request) => ({
    sessionToken: controlSessionToken(request),
    ...(requestId(request) === undefined
      ? {}
      : { requestId: requestId(request) }),
  }),
  present: (outcome) =>
    presentControlBrowser("control.load-auth-session.v1", outcome, (data) =>
      encodeControlAuthValue(
        controlLoginDataSchema.options[0],
        data,
        "session",
      ),
    ),
})
