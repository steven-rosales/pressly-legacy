import { defineControlAuthContract } from "../../../auth/model/boundary-contract.ts"
import {
  noFailureSchema,
  revokedCountSchema,
  revokeIdentityInputSchema,
} from "../../../auth/model/schemas.ts"

export const controlRevokeAllIdentitySessionsContract =
  defineControlAuthContract({
    label: "control.revoke-all-identity-sessions.v1",
    input: revokeIdentityInputSchema,
    output: revokedCountSchema,
    failure: noFailureSchema,
  })
