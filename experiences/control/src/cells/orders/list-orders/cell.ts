import type { ControlOrderOrLocationFailure } from "../../../management/model/failure.ts"
import type {
  ListControlOrdersInput,
  OrderList,
} from "../../../management/orders/contracts.ts"
import { listControlOrdersContract } from "./contract.ts"
import { listSurface } from "./http.ts"
import { declareQueryCell } from "@pressly/cells"

export const readAuthorization = {
  capability: "orders:read",
  timing: "before-input",
} as const

export const listControlOrdersCellDeclaration = declareQueryCell<
  ListControlOrdersInput,
  OrderList,
  ControlOrderOrLocationFailure
>({
  id: "control.list-orders.v1",
  contract: listControlOrdersContract,
  authorization: readAuthorization,
  consistency: { transaction: "none", concurrency: "none" },
  surfaces: [listSurface],
  observability: { operation: "control.list_orders" },
})
