import type {
  IdentityInput,
  SessionInventory,
} from "../../../auth/model/schemas.ts"
import { controlListIdentitySessionsContract } from "./contract.ts"
import { listSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const controlListIdentitySessionsCellDeclaration = defineOperation<
  IdentityInput,
  SessionInventory,
  never
>({
  kind: "query",
  id: "control.list-identity-sessions.v1",
  contract: controlListIdentitySessionsContract,
  authorization: { capability: "auth:session:read", timing: "before-input" },
  consistency: { transaction: "none", concurrency: "none" },
  surfaces: [listSurface],
  observability: { operation: "control.authentication.list_identity_sessions" },
})
