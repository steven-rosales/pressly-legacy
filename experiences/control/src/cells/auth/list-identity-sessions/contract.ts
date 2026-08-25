import { defineControlAuthContract } from "../../../auth/model/boundary-contract.ts"
import {
  identityInputSchema,
  noFailureSchema,
  sessionInventorySchema,
} from "../../../auth/model/schemas.ts"

export const controlListIdentitySessionsContract = defineControlAuthContract({
  label: "control.list-identity-sessions.v1",
  input: identityInputSchema,
  output: sessionInventorySchema,
  failure: noFailureSchema,
})
