import {
  parsedBody,
  requestMetadata,
  validateBody,
} from "../../../auth/model/http.ts"
import { presentControlAdminAuth } from "../../../auth/model/presentation.ts"
import type { CliAuthApiLoginFailure } from "../../../auth/model/cli-auth-api.ts"
import type { CliLoginResult } from "../../../cli/model.ts"
import { loginBodySchema } from "../../../auth/model/schemas.ts"
import { controlCliAuthApiLoginContract } from "./contract.ts"
import { http } from "@pressly/cells"
export const controlCliAuthApiLoginSurface = http.post<
  CliLoginResult,
  CliAuthApiLoginFailure
>({
  path: "/control/cli/auth/login",
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
    presentControlAdminAuth(
      outcome,
      controlCliAuthApiLoginContract.output.encode,
    ),
})
