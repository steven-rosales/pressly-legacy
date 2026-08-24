import { defineControlAuthContract } from "../../../auth/model/boundary-contract.ts"
import {
  controlSessionFailureSchema,
  controlSessionOutputSchema,
  cookieSessionInputSchema,
} from "../../../auth/model/schemas.ts"

export const controlLoadSessionContract = defineControlAuthContract({
  label: "control.load-auth-session.v1",
  input: cookieSessionInputSchema,
  output: controlSessionOutputSchema,
  failure: controlSessionFailureSchema,
})
