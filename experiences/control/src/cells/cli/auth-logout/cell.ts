import { logoutSurface } from "./cli.ts"
import { logoutContract } from "./contract.ts"
import { declareCommandCell } from "@pressly/cells"

export const adminCliAuthLogoutCellDeclaration = declareCommandCell({
  id: "control.cli-auth-logout.v1",
  authentication: "none",
  contract: logoutContract,
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [logoutSurface],
  observability: { operation: "control.cli.auth_logout" },
})
