import type {
  ControlSessionFailure,
  ControlLogoutOutput,
} from "../../../auth/model/schemas.ts"
import { encodeControlAuthValue } from "../../../auth/model/boundary-contract.ts"
import { controlSessionToken, requestId } from "../../../auth/model/http.ts"
import { presentControlBrowser } from "../../../auth/model/presentation.ts"
import { logoutSchema } from "../../../auth/model/schemas.ts"
import { http } from "@pressly/cells"

export const logoutSurface = http.post<
  ControlLogoutOutput,
  ControlSessionFailure
>({
  path: "/control/auth/logout",
  bodyLimit: "16kb",
  contextRequirements: ["control-session-cookie", "request-metadata"],
  toSerializedInput: (request) => ({
    sessionToken: controlSessionToken(request),
    ...(requestId(request) === undefined
      ? {}
      : { requestId: requestId(request) }),
  }),
  present: (outcome) =>
    presentControlBrowser("control.logout.v1", outcome, (data) =>
      encodeControlAuthValue(logoutSchema, data, "logout"),
    ),
})
