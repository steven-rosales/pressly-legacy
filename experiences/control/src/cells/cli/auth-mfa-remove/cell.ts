import { removeSurface } from "./cli.ts"
import { removeContract } from "./contract.ts"
import { defineOperation } from "@pressly/cells"

export const adminCliAuthMfaRemoveCellDeclaration = defineOperation({
  kind: "command",
  id: "control.cli-auth-mfa-remove.v1",
  authentication: "none",
  contract: removeContract,
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [removeSurface],
  observability: { operation: "control.cli.auth_mfa_remove" },
})
