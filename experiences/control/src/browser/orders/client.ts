import {
  controlOrderDetailSchema,
  controlOrderListSchema,
  orderMutationResultSchema,
} from "../contracts/orders.ts"
import {
  appendBrowserQuery,
  renderBrowserPath,
  strictWireCodec,
  type ControlBrowserRequestTransport,
} from "../transport.ts"
import type {
  ControlOrderOperations,
  ControlOrdersBrowserClient,
} from "./types.ts"

const orderListCodec = strictWireCodec(controlOrderListSchema)
const orderDetailCodec = strictWireCodec(controlOrderDetailSchema)
const mutationCodec = strictWireCodec(orderMutationResultSchema)

const estimatedWeight = (lbs: number | null) => ({
  lbs,
  source: lbs === null ? null : "control_manager_entry",
})

export const makeControlOrdersBrowserClient = (
  input: Readonly<{
    operations: ControlOrderOperations
    request: ControlBrowserRequestTransport
    idempotencyKey: () => string
  }>,
): ControlOrdersBrowserClient =>
  Object.freeze({
    list: ({ query, state, locationId, cursor, limit = 25 }) => {
      const surface = input.operations.listOrders.http.orders
      const trimmedQuery = query.trim()
      return input.request(
        {
          method: surface.method,
          path: appendBrowserQuery(surface.path, [
            ["query", trimmedQuery.length === 0 ? null : trimmedQuery],
            ["state", state],
            ["locationId", locationId],
            ["cursor", cursor],
            ["limit", limit],
          ]),
        },
        orderListCodec,
      )
    },
    get: (orderId) => {
      const surface = input.operations.getOrder.http.request
      return input.request(
        {
          method: surface.method,
          path: renderBrowserPath(surface.path, { orderId }),
        },
        orderDetailCodec,
      )
    },
    create: (order) => {
      const surface = input.operations.createOrder.http.orders
      return input.request(
        {
          method: surface.method,
          path: surface.path,
          csrf: true,
          body: {
            idempotencyKey: input.idempotencyKey(),
            reasonCode: "new_customer_order",
            reasonNote: "Created in Pressly Control.",
            customer: {
              resolution: "resolved",
              userId: order.customerId,
            },
            displayNumber: order.displayNumber,
            dueAt: order.dueAt,
            currency: "USD",
            totalAmountCents: order.totalAmountCents,
            balanceDueCents: order.balanceDueCents,
            items: [],
            fulfillment: {
              typeCode: "wash_fold",
              locationId: order.locationId,
              estimatedWeightLbs: order.estimatedWeightLbs,
              estimatedWeightSource:
                order.estimatedWeightLbs === null
                  ? null
                  : "control_manager_entry",
            },
          },
        },
        mutationCodec,
      )
    },
    correct: (correction) => {
      const surface = input.operations.correctOrder.http.request
      return input.request(
        {
          method: surface.method,
          path: renderBrowserPath(surface.path, {
            orderId: correction.order.id,
          }),
          csrf: true,
          body: {
            idempotencyKey: input.idempotencyKey(),
            reasonCode: "manager_correction",
            reasonNote: correction.reasonNote,
            expectedOrderVersion: correction.order.version,
            expectedFulfillmentVersion: correction.order.fulfillment.version,
            changes: {
              customer: {
                resolution: "resolved",
                userId: correction.customerId,
              },
              displayNumber: correction.displayNumber,
              dueAt: correction.dueAt,
              totalAmountCents: correction.totalAmountCents,
              balanceDueCents: correction.balanceDueCents,
              fulfillment: {
                estimatedWeight: estimatedWeight(correction.estimatedWeightLbs),
              },
            },
          },
        },
        mutationCodec,
      )
    },
  })
