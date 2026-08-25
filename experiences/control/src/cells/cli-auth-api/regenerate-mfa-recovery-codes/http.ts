import type { RecoveryCodes } from "../../../auth/model/schemas.ts"
import { principalContext, requestId } from "../../../auth/model/http.ts"
import { presentControlAdminValue } from "../../../auth/model/presentation.ts"
import { controlCliAuthApiRegenerateMfaRecoveryCodesContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const controlCliAuthApiRegenerateMfaRecoveryCodesSurface = http.post<
  RecoveryCodes,
  never
>({
  path: "/control/cli/auth/mfa/recovery-codes/regenerate",
  bodyLimit: "16kb",
  contextRequirements: ["authenticated-principal", "request-metadata"],
  toSerializedInput: (request) => ({
    identityId: principalContext(request).identityId,
    ...(requestId(request) === undefined
      ? {}
      : { requestId: requestId(request) }),
  }),
  present: (outcome) =>
    presentControlAdminValue(
      outcome,
      controlCliAuthApiRegenerateMfaRecoveryCodesContract.output.encode,
    ),
})
