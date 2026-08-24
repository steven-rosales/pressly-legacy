import { defineControlAuthContract } from "../../../auth/model/boundary-contract.ts"
import {
  controlSessionFailureSchema,
  controlLogoutOutputSchema,
  cookieSessionInputSchema,
} from "../../../auth/model/schemas.ts"

export const controlLogoutContract = defineControlAuthContract({
  label: "control.logout.v1",
  input: cookieSessionInputSchema,
  output: controlLogoutOutputSchema,
  failure: controlSessionFailureSchema,
})
