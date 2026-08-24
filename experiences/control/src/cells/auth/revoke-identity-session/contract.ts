import { defineControlAuthContract } from "../../../auth/model/boundary-contract.ts"
import {
  noFailureSchema,
  revokedCountSchema,
  revokeIdentityInputSchema,
} from "../../../auth/model/schemas.ts"

export const controlRevokeIdentitySessionContract = defineControlAuthContract({
  label: "control.revoke-identity-session.v1",
  input: revokeIdentityInputSchema,
  output: revokedCountSchema,
  failure: noFailureSchema,
})
