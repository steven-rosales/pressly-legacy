import type { OrderManagementExecute } from "../../../management/model/dependencies.ts"
import type { OrderProjection } from "../../../management/orders/contracts.ts"
import { orderFailure } from "../../../management/model/failure.ts"
import { getControlOrderCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

const projectOrder = (order: {
  orderId: string
  orderVersion: number
  displayNumber: string | null
  state: "open" | "completed" | "canceled"
  dueAt: Date
  currency: string
  totalAmountCents: number
  balanceDueCents: number | null
  customer: OrderProjection["customer"]
  fulfillmentId: string
  fulfillmentVersion: number
  fulfillment: Omit<OrderProjection["fulfillment"], "id" | "version">
  createdAt: Date
  updatedAt: Date
}): OrderProjection => ({
  id: order.orderId,
  version: order.orderVersion,
  displayNumber: order.displayNumber,
  state: order.state,
  dueAt: order.dueAt,
  currency: order.currency,
  totalAmountCents: order.totalAmountCents,
  balanceDueCents: order.balanceDueCents,
  customer: order.customer,
  fulfillment: {
    id: order.fulfillmentId,
    version: order.fulfillmentVersion,
    ...order.fulfillment,
  },
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
})

export const makeGetControlOrderCell = (
  orders: OrderManagementExecute<"getCanonicalOrder">,
) =>
  defineOperation(getControlOrderCellDeclaration, async (input) => {
    const locationIds = input.context.access.locations.map(
      (location) => location.id,
    )
    const outcome = await orders.execute({
      businessId: input.context.access.business.id,
      locationIds,
      orderId: input.orderId,
    })
    return outcome.kind === "failure"
      ? { kind: "failure", failure: orderFailure(outcome.failure) }
      : {
          kind: "success",
          value: {
            ...projectOrder(outcome.value),
            items: outcome.value.items.map((item) => ({ ...item })),
          },
        }
  })
