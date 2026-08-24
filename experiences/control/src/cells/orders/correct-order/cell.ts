import type { ControlOrderFailure } from "../../../management/model/failure.ts"
import type {
  CorrectControlOrderInput,
  OrderMutation,
} from "../../../management/orders/contracts.ts"
import { correctControlOrderContract } from "./contract.ts"
import { correctSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const writeAuthorization = {
  capability: "orders:write",
  timing: "before-input",
} as const

export const correctControlOrderCellDeclaration = declareCommandCell<
  CorrectControlOrderInput,
  OrderMutation,
  ControlOrderFailure
>({
  id: "control.correct-order.v1",
  contract: correctControlOrderContract,
  authorization: writeAuthorization,
  consistency: { transaction: "none", concurrency: "optimistic" },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [correctSurface],
  observability: { operation: "control.correct_order" },
})
