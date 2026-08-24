import type { MfaMutation } from "../../../auth/model/schemas.ts"
import { principalContext, requestId } from "../../../auth/model/http.ts"
import { presentControlAdminValue } from "../../../auth/model/presentation.ts"
import { controlCliAuthApiRemoveMfaContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const controlCliAuthApiRemoveMfaSurface = http.post<MfaMutation, never>({
  path: "/control/cli/auth/mfa/remove",
  bodyLimit: "16kb",
  contextRequirements: ["authenticated-principal", "request-metadata"],
  toSerializedInput: (request) => {
    const principal = principalContext(request)
    return {
      identityId: principal.identityId,
      sessionId: principal.sessionId,
      ...(requestId(request) === undefined
        ? {}
        : { requestId: requestId(request) }),
    }
  },
  present: (outcome) =>
    presentControlAdminValue(
      outcome,
      controlCliAuthApiRemoveMfaContract.output.encode,
    ),
})
