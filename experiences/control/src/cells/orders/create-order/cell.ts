import type { ControlOrderOrLocationFailure } from "../../../management/model/failure.ts"
import type {
  CreateControlOrderInput,
  OrderMutation,
} from "../../../management/orders/contracts.ts"
import { createControlOrderContract } from "./contract.ts"
import { createSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const writeAuthorization = {
  capability: "orders:write",
  timing: "before-input",
} as const

export const createControlOrderCellDeclaration = defineOperation<
  CreateControlOrderInput,
  OrderMutation,
  ControlOrderOrLocationFailure
>({
  kind: "command",
  id: "control.create-order.v1",
  contract: createControlOrderContract,
  authorization: writeAuthorization,
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [createSurface],
  observability: { operation: "control.create_order" },
})
