import { defineControlAuthContract } from "../../../auth/model/boundary-contract.ts"
import {
  identityMutationInputSchema,
  noFailureSchema,
  recoveryCodesSchema,
} from "../../../auth/model/schemas.ts"

export const controlRegenerateMfaRecoveryCodesContract =
  defineControlAuthContract({
    label: "control.regenerate-mfa-recovery-codes.v1",
    input: identityMutationInputSchema,
    output: recoveryCodesSchema,
    failure: noFailureSchema,
  })
