import { confirmSurface } from "./cli.ts"
import { confirmContract } from "./contract.ts"
import { defineOperation } from "@pressly/cells"

export const adminCliAuthMfaConfirmCellDeclaration = defineOperation({
  kind: "command",
  id: "control.cli-auth-mfa-confirm.v1",
  authentication: "none",
  contract: confirmContract,
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [confirmSurface],
  observability: { operation: "control.cli.auth_mfa_confirm" },
})
