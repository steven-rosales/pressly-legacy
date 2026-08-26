import { recoverySurface } from "./cli.ts"
import { recoveryContract } from "./contract.ts"
import { defineOperation } from "@pressly/cells"

export const adminCliAuthMfaRecoveryCodesCellDeclaration = defineOperation({
  kind: "command",
  id: "control.cli-auth-mfa-recovery-codes.v1",
  authentication: "none",
  contract: recoveryContract,
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [recoverySurface],
  observability: { operation: "control.cli.auth_mfa_recovery_codes" },
})
