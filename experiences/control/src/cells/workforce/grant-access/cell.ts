import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type {
  GrantAccessInput,
  GrantProjection,
} from "../../../management/workforce/contracts.ts"
import { grantControlAccessContract } from "./contract.ts"
import { grantAccessSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const writeAuthorization = {
  capability: "team:write",
  timing: "before-input",
} as const

export const grantControlAccessCellDeclaration = declareCommandCell<
  GrantAccessInput,
  GrantProjection,
  ControlWorkforceFailure
>({
  id: "control.grant-access.v1",
  contract: grantControlAccessContract,
  authorization: writeAuthorization,
  consistency: {
    transaction: "none",
    concurrency: "partitioned",
    concurrencyKey: (input) => input.membershipId,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [grantAccessSurface],
  observability: { operation: "control.grant_access" },
})
