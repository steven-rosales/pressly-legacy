import { loginSurface } from "./cli.ts"
import { loginContract } from "./contract.ts"
import { defineOperation } from "@pressly/cells"

export const adminCliAuthLoginCellDeclaration = defineOperation({
  kind: "command",
  id: "control.cli-auth-login.v1",
  authentication: "none",
  contract: loginContract,
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [loginSurface],
  observability: { operation: "control.cli.auth_login" },
})
