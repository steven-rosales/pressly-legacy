import { defineControlAuthContract } from "../../../auth/model/boundary-contract.ts"
import {
  mfaMutationSchema,
  noFailureSchema,
  removeMfaInputSchema,
} from "../../../auth/model/schemas.ts"

export const controlCliAuthApiRemoveMfaContract = defineControlAuthContract({
  label: "control.cli-auth-api-remove-mfa.v1",
  input: removeMfaInputSchema,
  output: mfaMutationSchema,
  failure: noFailureSchema,
})
