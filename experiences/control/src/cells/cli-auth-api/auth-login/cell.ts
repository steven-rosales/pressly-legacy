import type {
  CliAuthApiLoginFailure,
  CliAuthApiLoginInput,
} from "../../../auth/model/cli-auth-api.ts"
import type { CliLoginResult } from "../../../cli/model.ts"
import { controlCliAuthApiLoginContract } from "./contract.ts"
import { controlCliAuthApiLoginSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const controlCliAuthApiLoginCellDeclaration = declareCommandCell<
  CliAuthApiLoginInput,
  CliLoginResult,
  CliAuthApiLoginFailure
>({
  id: "control.cli-auth-api-login.v1",
  authentication: "none",
  contract: controlCliAuthApiLoginContract,
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [controlCliAuthApiLoginSurface],
  observability: { operation: "control.cli_auth_api.auth_login" },
})
