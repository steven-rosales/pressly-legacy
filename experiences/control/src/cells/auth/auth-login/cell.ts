import type {
  ControlLoginFailure,
  ControlLoginOutput,
  LoginInput,
} from "../../../auth/model/schemas.ts"
import { controlLoginContract } from "./contract.ts"
import { loginSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const controlLoginCellDeclaration = defineOperation<
  LoginInput,
  ControlLoginOutput,
  ControlLoginFailure
>({
  kind: "command",
  id: "control.auth-login.v1",
  authentication: "none",
  contract: controlLoginContract,
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [loginSurface],
  observability: { operation: "control.authentication.login" },
})
