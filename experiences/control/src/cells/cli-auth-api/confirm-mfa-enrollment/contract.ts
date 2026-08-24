import { defineControlAuthContract } from "../../../auth/model/boundary-contract.ts"
import {
  confirmMfaInputSchema,
  confirmMfaFailureSchema,
  recoveryCodesSchema,
} from "../../../auth/model/schemas.ts"

export const controlCliAuthApiConfirmMfaEnrollmentContract =
  defineControlAuthContract({
    label: "control.cli-auth-api-confirm-mfa-enrollment.v1",
    input: confirmMfaInputSchema,
    output: recoveryCodesSchema,
    failure: confirmMfaFailureSchema,
  })
