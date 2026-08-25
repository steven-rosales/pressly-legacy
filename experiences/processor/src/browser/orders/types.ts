import type {
  AcceptIncomingOrderProposalHttpBody,
  IncomingOrderProposalDecisionHttpResult,
  IncomingOrderProposalListHttpResult,
  RejectIncomingOrderProposalHttpBody,
  RestoreIncomingOrderProposalHttpBody,
  RestoreIncomingOrderProposalHttpResult,
} from "@pressly/orders-system/http/order-management"
import type {
  BrowserHttpSurface,
  GeneratedBrowserOperation,
} from "../transport.ts"

export type ProcessorOrderOperations = Readonly<{
  listIncomingOrders: GeneratedBrowserOperation<
    "orders.list-incoming-order-proposals.v1",
    Readonly<{ "incoming-orders": BrowserHttpSurface<"GET"> }>
  >
  acceptIncomingOrder: GeneratedBrowserOperation<
    "orders.accept-incoming-order-proposal.v1",
    Readonly<{ accept: BrowserHttpSurface<"POST"> }>
  >
  rejectIncomingOrder: GeneratedBrowserOperation<
    "orders.reject-incoming-order-proposal.v1",
    Readonly<{ reject: BrowserHttpSurface<"POST"> }>
  >
  restoreIncomingOrder: GeneratedBrowserOperation<
    "orders.restore-incoming-order-proposal.v1",
    Readonly<{ restore: BrowserHttpSurface<"POST"> }>
  >
}>

export type ProcessorOrdersBrowserClient = Readonly<{
  listIncomingOrders: (
    input: Readonly<{
      locationId: string
      view: "needs_review" | "source_closed"
      limit?: number
      cursor?: string | null
      signal?: AbortSignal
    }>
  ) => Promise<IncomingOrderProposalListHttpResult>
  acceptIncomingOrder: (
    input: Readonly<{
      locationId: string
      proposalId: string
      request: AcceptIncomingOrderProposalHttpBody
    }>
  ) => Promise<IncomingOrderProposalDecisionHttpResult>
  rejectIncomingOrder: (
    input: Readonly<{
      locationId: string
      proposalId: string
      request: RejectIncomingOrderProposalHttpBody
    }>
  ) => Promise<IncomingOrderProposalDecisionHttpResult>
  restoreIncomingOrder: (
    input: Readonly<{
      locationId: string
      proposalId: string
      request: RestoreIncomingOrderProposalHttpBody
    }>
  ) => Promise<RestoreIncomingOrderProposalHttpResult>
}>
