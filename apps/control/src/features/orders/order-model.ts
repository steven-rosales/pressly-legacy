import type { ControlOrder } from "@pressly/contracts"

export {
  controlOrderDetailSchema,
  controlOrderListSchema as controlOrderPageSchema,
  controlOrderSchema,
  orderMutationResultSchema,
} from "@pressly/contracts"
export type {
  ControlOrder,
  ControlOrderDetail,
  ControlOrderList as ControlOrderPage,
  OrderMutationResult,
} from "@pressly/contracts"

export type OrderState = ControlOrder["state"]
