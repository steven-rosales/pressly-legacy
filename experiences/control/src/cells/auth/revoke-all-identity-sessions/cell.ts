import type {
  RevokedCount,
  RevokeIdentityInput,
} from "../../../auth/model/schemas.ts"
import { controlRevokeAllIdentitySessionsContract } from "./contract.ts"
import { revokeAllSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const controlRevokeAllIdentitySessionsCellDeclaration = defineOperation<
  RevokeIdentityInput,
  RevokedCount,
  never
>({
  kind: "command",
  id: "control.revoke-all-identity-sessions.v1",
  contract: controlRevokeAllIdentitySessionsContract,
  authorization: {
    capability: "auth:session:revoke",
    timing: "before-input",
  },
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [revokeAllSurface],
  observability: {
    operation: "control.authentication.revoke_all_identity_sessions",
  },
})
