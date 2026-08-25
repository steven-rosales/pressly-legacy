import { defineControlAuthContract } from "../../../auth/model/boundary-contract.ts"
import {
  beginMfaInputSchema,
  enrollmentSchema,
  beginMfaFailureSchema,
} from "../../../auth/model/schemas.ts"

export const controlCliAuthApiBeginMfaEnrollmentContract =
  defineControlAuthContract({
    label: "control.cli-auth-api-begin-mfa-enrollment.v1",
    input: beginMfaInputSchema,
    output: enrollmentSchema,
    failure: beginMfaFailureSchema,
  })
