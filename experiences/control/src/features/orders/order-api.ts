import type {
  ControlOrder,
  ControlOrderDetail,
  ControlOrderList,
  OrderMutationResult,
} from "../../browser/contracts/orders.ts"

export type OrderListInput = Readonly<{
  query: string
  state: ControlOrder["state"] | null
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
  list: (input: OrderListInput) => Promise<ControlOrderList>
  get: (orderId: string) => Promise<ControlOrderDetail>
  create: (input: CreateControlOrderInput) => Promise<OrderMutationResult>
  correct: (input: CorrectControlOrderInput) => Promise<OrderMutationResult>
}>
