import type {
  IdentityMutationInput,
  RecoveryCodes,
} from "../../../auth/model/schemas.ts"
import { controlCliAuthApiRegenerateMfaRecoveryCodesContract } from "./contract.ts"
import { controlCliAuthApiRegenerateMfaRecoveryCodesSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const controlCliAuthApiRegenerateMfaRecoveryCodesCellDeclaration =
  defineOperation<IdentityMutationInput, RecoveryCodes, never>({
    kind: "command",
    id: "control.cli-auth-api-regenerate-mfa-recovery-codes.v1",
    contract: controlCliAuthApiRegenerateMfaRecoveryCodesContract,
    authorization: {
      capability: "auth:mfa:manage",
      timing: "after-input",
      scope: (input) => `auth.identity:${input.identityId}`,
    },
    consistency: { transaction: "none", concurrency: "none" },
    idempotency: { required: false },
    surfaces: [controlCliAuthApiRegenerateMfaRecoveryCodesSurface],
    observability: {
      operation: "control.cli_auth_api.regenerate_mfa_recovery_codes",
    },
  })
