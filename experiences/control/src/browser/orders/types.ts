import type {
  ControlOrder,
  ControlOrderDetail,
  ControlOrderList,
  OrderMutationResult,
} from "../contracts/orders.ts"
import type {
  BrowserHttpSurface,
  GeneratedBrowserOperation,
} from "../transport.ts"

export type ControlOrderListInput = Readonly<{
  query: string
  state: ControlOrder["state"] | null
  locationId: string | null
  cursor: string | null
  limit?: number
}>

export type CreateControlOrderBrowserInput = Readonly<{
  customerId: string
  displayNumber: string | null
  dueAt: string
  totalAmountCents: number
  balanceDueCents: number | null
  locationId: string
  estimatedWeightLbs: number | null
}>

export type CorrectControlOrderBrowserInput = Readonly<{
  order: ControlOrderDetail
  customerId: string
  displayNumber: string | null
  dueAt: string
  totalAmountCents: number
  balanceDueCents: number | null
  estimatedWeightLbs: number | null
  reasonNote: string
}>

export type ControlOrderOperations = Readonly<{
  listOrders: GeneratedBrowserOperation<
    "control.list-orders.v1",
    Readonly<{ orders: BrowserHttpSurface<"GET"> }>
  >
  getOrder: GeneratedBrowserOperation<
    "control.get-order.v1",
    Readonly<{ request: BrowserHttpSurface<"GET"> }>
  >
  createOrder: GeneratedBrowserOperation<
    "control.create-order.v1",
    Readonly<{ orders: BrowserHttpSurface<"POST"> }>
  >
  correctOrder: GeneratedBrowserOperation<
    "control.correct-order.v1",
    Readonly<{ request: BrowserHttpSurface<"PATCH"> }>
  >
}>

export type ControlOrdersBrowserClient = Readonly<{
  list: (input: ControlOrderListInput) => Promise<ControlOrderList>
  get: (orderId: string) => Promise<ControlOrderDetail>
  create: (
    input: CreateControlOrderBrowserInput,
  ) => Promise<OrderMutationResult>
  correct: (
    input: CorrectControlOrderBrowserInput,
  ) => Promise<OrderMutationResult>
}>
