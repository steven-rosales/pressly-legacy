import type {
  RevokedCount,
  RevokeIdentityInput,
} from "../../../auth/model/schemas.ts"
import { controlRevokeIdentitySessionContract } from "./contract.ts"
import { revokeOneSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const controlRevokeIdentitySessionCellDeclaration = defineOperation<
  RevokeIdentityInput,
  RevokedCount,
  never
>({
  kind: "command",
  id: "control.revoke-identity-session.v1",
  contract: controlRevokeIdentitySessionContract,
  authorization: { capability: "auth:session:revoke", timing: "before-input" },
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [revokeOneSurface],
  observability: {
    operation: "control.authentication.revoke_identity_session",
  },
})
