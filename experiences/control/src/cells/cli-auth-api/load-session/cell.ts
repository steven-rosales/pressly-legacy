import type {
  CliAuthApiSessionFailure,
  CliAuthApiTokenInput,
} from "../../../auth/model/cli-auth-api.ts"
import type { CliSessionResult } from "../../../cli/model.ts"
import { controlCliAuthApiLoadSessionContract } from "./contract.ts"
import { controlCliAuthApiLoadSessionSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const controlCliAuthApiLoadSessionCellDeclaration = defineOperation<
  Omit<CliAuthApiTokenInput, "requestId">,
  CliSessionResult,
  CliAuthApiSessionFailure
>({
  kind: "query",
  id: "control.cli-auth-api-load-session.v1",
  authentication: "none",
  contract: controlCliAuthApiLoadSessionContract,
  consistency: { transaction: "none", concurrency: "none" },
  surfaces: [controlCliAuthApiLoadSessionSurface],
  observability: { operation: "control.cli_auth_api.load_session" },
})
