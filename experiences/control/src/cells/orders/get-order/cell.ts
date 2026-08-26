import type { ControlOrderFailure } from "../../../management/model/failure.ts"
import type {
  GetControlOrderInput,
  OrderDetail,
} from "../../../management/orders/contracts.ts"
import { getControlOrderContract } from "./contract.ts"
import { getSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const readAuthorization = {
  capability: "orders:read",
  timing: "before-input",
} as const

export const getControlOrderCellDeclaration = defineOperation<
  GetControlOrderInput,
  OrderDetail,
  ControlOrderFailure
>({
  kind: "query",
  id: "control.get-order.v1",
  contract: getControlOrderContract,
  authorization: readAuthorization,
  consistency: { transaction: "none", concurrency: "none" },
  surfaces: [getSurface],
  observability: { operation: "control.get_order" },
})
