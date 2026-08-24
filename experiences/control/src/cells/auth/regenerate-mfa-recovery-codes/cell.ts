import type {
  IdentityMutationInput,
  RecoveryCodes,
} from "../../../auth/model/schemas.ts"
import { controlRegenerateMfaRecoveryCodesContract } from "./contract.ts"
import { regenerateSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const controlRegenerateMfaRecoveryCodesCellDeclaration =
  declareCommandCell<IdentityMutationInput, RecoveryCodes, never>({
    id: "control.regenerate-mfa-recovery-codes.v1",
    contract: controlRegenerateMfaRecoveryCodesContract,
    authorization: {
      capability: "auth:mfa:manage",
      timing: "after-input",
      scope: (input) => `auth.identity:${input.identityId}`,
    },
    consistency: { transaction: "none", concurrency: "none" },
    idempotency: { required: false },
    surfaces: [regenerateSurface],
    observability: {
      operation: "control.authentication.regenerate_mfa_recovery_codes",
    },
  })
