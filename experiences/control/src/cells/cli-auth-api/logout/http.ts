import { bearerToken, requestId } from "../../../auth/model/http.ts"
import { presentControlAdminValue } from "../../../auth/model/presentation.ts"
import type { CliLogout } from "../../../cli/model.ts"
import { controlCliAuthApiLogoutContract } from "./contract.ts"
import { http } from "@pressly/cells"
export const controlCliAuthApiLogoutSurface = http.post<CliLogout, never>({
  path: "/control/cli/auth/logout",
  bodyLimit: "64kb",
  contextRequirements: ["request-metadata"],
  toSerializedInput: (request) => ({
    bearerToken: bearerToken(request),
    ...(requestId(request) === undefined
      ? {}
      : { requestId: requestId(request) }),
  }),
  present: (outcome) =>
    presentControlAdminValue(
      outcome,
      controlCliAuthApiLogoutContract.output.encode,
    ),
})
