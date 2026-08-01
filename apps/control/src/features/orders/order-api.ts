import type { ControlHttpClient } from "@/api/control-http-client"
import {
  controlOrderDetailSchema,
  controlOrderPageSchema,
  orderMutationResultSchema,
  type ControlOrderDetail,
  type ControlOrderPage,
  type OrderMutationResult,
  type OrderState,
} from "./order-model"

export type OrderListInput = Readonly<{
  query: string
  state: OrderState | null
  locationId: string | null
  cursor: string | null
  limit?: number
}>

export type CreateControlOrderInput = Readonly<{
  customerId: string
  displayNumber: string | null
  dueAt: string
  totalAmountCents: number
  balanceDueCents: number | null
  locationId: string
  estimatedWeightLbs: number | null
}>

export type CorrectControlOrderInput = Readonly<{
  order: ControlOrderDetail
  customerId: string
  displayNumber: string | null
  dueAt: string
  totalAmountCents: number
  balanceDueCents: number | null
  estimatedWeightLbs: number | null
  reasonNote: string
}>

export type ControlOrderApi = Readonly<{
  list: (input: OrderListInput) => Promise<ControlOrderPage>
  get: (orderId: string) => Promise<ControlOrderDetail>
  create: (input: CreateControlOrderInput) => Promise<OrderMutationResult>
  correct: (input: CorrectControlOrderInput) => Promise<OrderMutationResult>
}>

const idempotencyKey = () => crypto.randomUUID()

const queryString = (input: OrderListInput) => {
  const parameters = new URLSearchParams()
  if (input.query.trim().length > 0) parameters.set("query", input.query.trim())
  if (input.state !== null) parameters.set("state", input.state)
  if (input.locationId !== null) parameters.set("locationId", input.locationId)
  if (input.cursor !== null) parameters.set("cursor", input.cursor)
  parameters.set("limit", String(input.limit ?? 25))
  return parameters.toString()
}

const estimatedWeight = (lbs: number | null) => ({
  lbs,
  source: lbs === null ? null : "control_manager_entry",
})

export function makeControlOrderApi(
  client: ControlHttpClient,
): ControlOrderApi {
  return {
    list: (input) =>
      client.request(
        { path: `/control/orders?${queryString(input)}` },
        controlOrderPageSchema,
      ),
    get: (orderId) =>
      client.request(
        { path: `/control/orders/${encodeURIComponent(orderId)}` },
        controlOrderDetailSchema,
      ),
    create: (input) =>
      client.request(
        {
          method: "POST",
          path: "/control/orders",
          csrf: true,
          body: {
            idempotencyKey: idempotencyKey(),
            reasonCode: "new_customer_order",
            reasonNote: "Created in Pressly Control.",
            customer: {
              resolution: "resolved",
              userId: input.customerId,
            },
            displayNumber: input.displayNumber,
            dueAt: input.dueAt,
            currency: "USD",
            totalAmountCents: input.totalAmountCents,
            balanceDueCents: input.balanceDueCents,
            items: [],
            fulfillment: {
              typeCode: "wash_fold",
              locationId: input.locationId,
              estimatedWeightLbs: input.estimatedWeightLbs,
              estimatedWeightSource:
                input.estimatedWeightLbs === null
                  ? null
                  : "control_manager_entry",
            },
          },
        },
        orderMutationResultSchema,
      ),
    correct: (input) =>
      client.request(
        {
          method: "PATCH",
          path: `/control/orders/${encodeURIComponent(input.order.id)}`,
          csrf: true,
          body: {
            idempotencyKey: idempotencyKey(),
            reasonCode: "manager_correction",
            reasonNote: input.reasonNote,
            expectedOrderVersion: input.order.version,
            expectedFulfillmentVersion: input.order.fulfillment.version,
            changes: {
              customer: {
                resolution: "resolved",
                userId: input.customerId,
              },
              displayNumber: input.displayNumber,
              dueAt: input.dueAt,
              totalAmountCents: input.totalAmountCents,
              balanceDueCents: input.balanceDueCents,
              fulfillment: {
                estimatedWeight: estimatedWeight(input.estimatedWeightLbs),
              },
            },
          },
        },
        orderMutationResultSchema,
      ),
  }
}
