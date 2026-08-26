import type {
  MfaMutation,
  RemoveMfaInput,
} from "../../../auth/model/schemas.ts"
import { controlCliAuthApiRemoveMfaContract } from "./contract.ts"
import { controlCliAuthApiRemoveMfaSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const controlCliAuthApiRemoveMfaCellDeclaration = defineOperation<
  RemoveMfaInput,
  MfaMutation,
  never
>({
  kind: "command",
  id: "control.cli-auth-api-remove-mfa.v1",
  contract: controlCliAuthApiRemoveMfaContract,
  authorization: {
    capability: "auth:mfa:manage",
    timing: "after-input",
    scope: (input) => `auth.identity:${input.identityId}`,
  },
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: false },
  surfaces: [controlCliAuthApiRemoveMfaSurface],
  observability: { operation: "control.cli_auth_api.remove_mfa" },
})
