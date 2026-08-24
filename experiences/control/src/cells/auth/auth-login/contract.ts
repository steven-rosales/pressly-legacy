import { defineControlAuthContract } from "../../../auth/model/boundary-contract.ts"
import {
  controlLoginFailureSchema,
  controlLoginOutputSchema,
  loginInputSchema,
} from "../../../auth/model/schemas.ts"

export const controlLoginContract = defineControlAuthContract({
  label: "control.auth-login.v1",
  input: loginInputSchema,
  output: controlLoginOutputSchema,
  failure: controlLoginFailureSchema,
})
