import type { OrderManagementExecute } from "../../../management/model/dependencies.ts"
import type { ControlOrderOrLocationFailure } from "../../../management/model/failure.ts"
import type {
  ListControlOrdersInput,
  OrderProjection,
} from "../../../management/orders/contracts.ts"
import { orderFailure } from "../../../management/model/failure.ts"
import { listControlOrdersCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

const allowedLocationIds = (
  input: ListControlOrdersInput["context"],
  requested?: string,
):
  | Readonly<{
      kind: "success"
      value: readonly string[]
    }>
  | Readonly<{
      kind: "failure"
      failure: ControlOrderOrLocationFailure
    }> => {
  const allowed = input.access.locations.map((location) => location.id)
  if (requested === undefined) return { kind: "success", value: allowed }
  return allowed.includes(requested)
    ? { kind: "success", value: [requested] }
    : {
        kind: "failure",
        failure: {
          kind: "location_not_found",
          requestedLocationId: requested,
        },
      }
}

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

export const makeListControlOrdersCell = (
  orders: OrderManagementExecute<"listCanonicalOrders">,
) =>
  bindCell(listControlOrdersCellDeclaration, async (input) => {
    const locationIds = allowedLocationIds(input.context, input.locationId)
    if (locationIds.kind === "failure") return locationIds
    const outcome = await orders.execute({
      businessId: input.context.access.business.id,
      locationIds: locationIds.value,
      query: input.query ?? null,
      state: input.state ?? null,
      limit: input.limit,
      cursor: input.cursor ?? null,
    })
    return outcome.kind === "failure"
      ? { kind: "failure", failure: orderFailure(outcome.failure) }
      : {
          kind: "success",
          value: {
            items: outcome.value.items.map(projectOrder),
            nextCursor: outcome.value.nextCursor,
          },
        }
  })
