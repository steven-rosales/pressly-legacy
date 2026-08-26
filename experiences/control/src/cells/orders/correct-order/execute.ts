import type { OrderManagementExecute } from "../../../management/model/dependencies.ts"
import { orderFailure } from "../../../management/model/failure.ts"
import { correctControlOrderCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

export const makeCorrectControlOrderCell = (dependencies: {
  getOrder: OrderManagementExecute<"getCanonicalOrder">
  correctOrder: OrderManagementExecute<"correctOrder">
}) =>
  defineOperation(correctControlOrderCellDeclaration, async (input) => {
    const locationIds = input.context.access.locations.map(
      (location) => location.id,
    )
    const current = await dependencies.getOrder.execute({
      businessId: input.context.access.business.id,
      locationIds,
      orderId: input.orderId,
    })
    if (current.kind === "failure")
      return { kind: "failure", failure: orderFailure(current.failure) }
    const changes = {
      ...(input.changes.customer === undefined
        ? {}
        : {
            customer: {
              resolution: "resolved" as const,
              userId: input.changes.customer.userId,
              externalUserId: null,
            },
          }),
      ...(input.changes.displayNumber === undefined
        ? {}
        : { displayNumber: input.changes.displayNumber }),
      ...(input.changes.dueAt === undefined
        ? {}
        : { dueAt: input.changes.dueAt }),
      ...(input.changes.currency === undefined
        ? {}
        : { currency: input.changes.currency }),
      ...(input.changes.totalAmountCents === undefined
        ? {}
        : { totalAmountCents: input.changes.totalAmountCents }),
      ...(input.changes.balanceDueCents === undefined
        ? {}
        : { balanceDueCents: input.changes.balanceDueCents }),
      ...(input.changes.items === undefined
        ? {}
        : { items: input.changes.items }),
      ...(input.changes.fulfillment === undefined
        ? {}
        : {
            fulfillment: {
              ...(input.changes.fulfillment.typeCode === undefined
                ? {}
                : { typeCode: input.changes.fulfillment.typeCode }),
              ...(input.changes.fulfillment.locationId === undefined
                ? {}
                : { locationId: input.changes.fulfillment.locationId }),
              ...(input.changes.fulfillment.estimatedWeight === undefined
                ? {}
                : {
                    estimatedWeight: input.changes.fulfillment.estimatedWeight,
                  }),
            },
          }),
    }
    const outcome = await dependencies.correctOrder.execute({
      businessId: input.context.access.business.id,
      locationId: current.value.fulfillment.locationId,
      orderId: input.orderId,
      expectedOrderVersion: input.expectedOrderVersion,
      expectedFulfillmentVersion: input.expectedFulfillmentVersion,
      changes,
      idempotencyKey: input.idempotencyKey,
      context: input.context.command,
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote,
    })
    return outcome.kind === "failure"
      ? { kind: "failure", failure: orderFailure(outcome.failure) }
      : { kind: "success", value: outcome.value }
  })
