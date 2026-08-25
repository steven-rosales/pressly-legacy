import type {
  ControlSessionFailure,
  ControlLogoutOutput,
  CookieSessionInput,
} from "../../../auth/model/schemas.ts"
import { controlLogoutContract } from "./contract.ts"
import { logoutSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const controlLogoutCellDeclaration = declareCommandCell<
  CookieSessionInput,
  ControlLogoutOutput,
  ControlSessionFailure
>({
  id: "control.logout.v1",
  authentication: "none",
  contract: controlLogoutContract,
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [logoutSurface],
  observability: { operation: "control.authentication.logout" },
})
