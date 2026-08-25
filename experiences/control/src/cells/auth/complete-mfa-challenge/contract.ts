import { defineControlAuthContract } from "../../../auth/model/boundary-contract.ts"
import {
  controlSessionFailureSchema,
  controlSessionOutputSchema,
  cookieChallengeInputSchema,
} from "../../../auth/model/schemas.ts"

export const controlCompleteMfaChallengeContract = defineControlAuthContract({
  label: "control.complete-mfa-challenge.v1",
  input: cookieChallengeInputSchema,
  output: controlSessionOutputSchema,
  failure: controlSessionFailureSchema,
})
