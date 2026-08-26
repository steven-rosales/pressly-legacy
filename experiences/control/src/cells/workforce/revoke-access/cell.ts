import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type {
  RevokeAccessInput,
  RevokeAccessOutput,
} from "../../../management/workforce/contracts.ts"
import { revokeControlAccessContract } from "./contract.ts"
import { revokeAccessSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const writeAuthorization = {
  capability: "team:write",
  timing: "before-input",
} as const

export const revokeControlAccessCellDeclaration = defineOperation<
  RevokeAccessInput,
  RevokeAccessOutput,
  ControlWorkforceFailure
>({
  kind: "command",
  id: "control.revoke-access.v1",
  contract: revokeControlAccessContract,
  authorization: writeAuthorization,
  consistency: {
    transaction: "none",
    concurrency: "optimistic",
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [revokeAccessSurface],
  observability: { operation: "control.revoke_access" },
})
