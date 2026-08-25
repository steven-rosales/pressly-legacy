import { defineControlAuthContract } from "../../../auth/model/boundary-contract.ts"
import {
  mfaMutationSchema,
  noFailureSchema,
  removeMfaInputSchema,
} from "../../../auth/model/schemas.ts"

export const controlRemoveMfaContract = defineControlAuthContract({
  label: "control.remove-mfa.v1",
  input: removeMfaInputSchema,
  output: mfaMutationSchema,
  failure: noFailureSchema,
})
