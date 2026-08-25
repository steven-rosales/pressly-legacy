import { bearerToken } from "../../../auth/model/http.ts"
import { presentControlAdminAuth } from "../../../auth/model/presentation.ts"
import type { CliAuthApiSessionFailure } from "../../../auth/model/cli-auth-api.ts"
import type { CliSessionResult } from "../../../cli/model.ts"
import { controlCliAuthApiLoadSessionContract } from "./contract.ts"
import { http } from "@pressly/cells"
export const controlCliAuthApiLoadSessionSurface = http.get<
  CliSessionResult,
  CliAuthApiSessionFailure
>({
  path: "/control/cli/auth/session",
  bodyLimit: "64kb",
  toSerializedInput: (request) => ({ bearerToken: bearerToken(request) }),
  present: (outcome) =>
    presentControlAdminAuth(
      outcome,
      controlCliAuthApiLoadSessionContract.output.encode,
    ),
})
