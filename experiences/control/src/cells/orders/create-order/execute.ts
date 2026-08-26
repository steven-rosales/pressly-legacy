import type { OrderManagementExecute } from "../../../management/model/dependencies.ts"
import type { ControlOrderOrLocationFailure } from "../../../management/model/failure.ts"
import type { ListControlOrdersInput } from "../../../management/orders/contracts.ts"
import { orderFailure } from "../../../management/model/failure.ts"
import { createControlOrderCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

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

export const makeCreateControlOrderCell = (
  orders: OrderManagementExecute<"createOrder">,
) =>
  defineOperation(createControlOrderCellDeclaration, async (input) => {
    const locationIds = allowedLocationIds(
      input.context,
      input.fulfillment.locationId,
    )
    if (locationIds.kind === "failure") return locationIds
    const outcome = await orders.execute({
      businessId: input.context.access.business.id,
      idempotencyKey: input.idempotencyKey,
      context: input.context.command,
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote,
      customer: {
        resolution: "resolved",
        userId: input.customer.userId,
        externalUserId: null,
      },
      displayNumber: input.displayNumber,
      dueAt: input.dueAt,
      currency: input.currency,
      totalAmountCents: input.totalAmountCents,
      balanceDueCents: input.balanceDueCents,
      items: input.items,
      fulfillment: input.fulfillment,
    })
    return outcome.kind === "failure"
      ? { kind: "failure", failure: orderFailure(outcome.failure) }
      : { kind: "success", value: outcome.value }
  })
