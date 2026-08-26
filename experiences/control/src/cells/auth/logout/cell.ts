import type {
  ControlSessionFailure,
  ControlLogoutOutput,
  CookieSessionInput,
} from "../../../auth/model/schemas.ts"
import { controlLogoutContract } from "./contract.ts"
import { logoutSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const controlLogoutCellDeclaration = defineOperation<
  CookieSessionInput,
  ControlLogoutOutput,
  ControlSessionFailure
>({
  kind: "command",
  id: "control.logout.v1",
  authentication: "none",
  contract: controlLogoutContract,
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [logoutSurface],
  observability: { operation: "control.authentication.logout" },
})
