import { enrollmentSurface } from "./cli.ts"
import { enrollmentContract } from "./contract.ts"
import { defineOperation } from "@pressly/cells"

export const adminCliAuthMfaEnrollCellDeclaration = defineOperation({
  kind: "command",
  id: "control.cli-auth-mfa-enroll.v1",
  authentication: "none",
  contract: enrollmentContract,
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [enrollmentSurface],
  observability: { operation: "control.cli.auth_mfa_enroll" },
})
