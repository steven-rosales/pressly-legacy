import type {
  MfaMutation,
  RemoveMfaInput,
} from "../../../auth/model/schemas.ts"
import { controlRemoveMfaContract } from "./contract.ts"
import { removeSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const controlRemoveMfaCellDeclaration = declareCommandCell<
  RemoveMfaInput,
  MfaMutation,
  never
>({
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
