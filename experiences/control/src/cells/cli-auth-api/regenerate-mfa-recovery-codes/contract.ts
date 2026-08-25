import { defineControlAuthContract } from "../../../auth/model/boundary-contract.ts"
import {
  identityMutationInputSchema,
  noFailureSchema,
  recoveryCodesSchema,
} from "../../../auth/model/schemas.ts"

export const controlCliAuthApiRegenerateMfaRecoveryCodesContract =
  defineControlAuthContract({
    label: "control.cli-auth-api-regenerate-mfa-recovery-codes.v1",
    input: identityMutationInputSchema,
    output: recoveryCodesSchema,
    failure: noFailureSchema,
  })
