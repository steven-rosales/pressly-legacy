import type {
  MfaMutation,
  RemoveMfaInput,
} from "../../../auth/model/schemas.ts"
import { controlRemoveMfaContract } from "./contract.ts"
import { removeSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const controlRemoveMfaCellDeclaration = defineOperation<
  RemoveMfaInput,
  MfaMutation,
  never
>({
  kind: "command",
  id: "control.remove-mfa.v1",
  contract: controlRemoveMfaContract,
  authorization: {
    capability: "auth:mfa:manage",
    timing: "after-input",
    scope: (input) => `auth.identity:${input.identityId}`,
  },
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [removeSurface],
  observability: { operation: "control.authentication.remove_mfa" },
})
