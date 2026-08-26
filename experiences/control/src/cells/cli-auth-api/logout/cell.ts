import type { CliAuthApiTokenInput } from "../../../auth/model/cli-auth-api.ts"
import type { CliLogout } from "../../../cli/model.ts"
import { controlCliAuthApiLogoutContract } from "./contract.ts"
import { controlCliAuthApiLogoutSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const controlCliAuthApiLogoutCellDeclaration = defineOperation<
  CliAuthApiTokenInput,
  CliLogout,
  never
>({
  kind: "command",
  id: "control.cli-auth-api-logout.v1",
  authentication: "none",
  contract: controlCliAuthApiLogoutContract,
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [controlCliAuthApiLogoutSurface],
  observability: { operation: "control.cli_auth_api.logout" },
})
