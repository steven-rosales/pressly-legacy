import type { z } from "zod"
import type {
  acceptIncomingOrderProposalHttpBodySchema as acceptIncomingOrderProposalRequestSchema,
  incomingOrderProposalDecisionHttpResultSchema as incomingOrderProposalDecisionResultSchema,
  incomingOrderProposalListHttpResultSchema as incomingOrderProposalListSchema,
  rejectIncomingOrderProposalHttpBodySchema as rejectIncomingOrderProposalRequestSchema,
  restoreIncomingOrderProposalHttpBodySchema as restoreIncomingOrderProposalRequestSchema,
  restoreIncomingOrderProposalHttpResultSchema as restoreIncomingOrderProposalResultSchema,
} from "@pressly/orders-system/http/order-management"

export type IncomingOrderProposalList = z.infer<
  typeof incomingOrderProposalListSchema
>
export type IncomingOrderProposal = IncomingOrderProposalList["items"][number]
export type AcceptIncomingOrderProposalRequest = z.infer<
  typeof acceptIncomingOrderProposalRequestSchema
>
export type RejectIncomingOrderProposalRequest = z.infer<
  typeof rejectIncomingOrderProposalRequestSchema
>
export type IncomingOrderProposalDecisionResult = z.infer<
  typeof incomingOrderProposalDecisionResultSchema
>

export type IncomingOrderView = "needs_review" | "source_closed"

export type RestoreIncomingOrderProposalRequest = z.infer<
  typeof restoreIncomingOrderProposalRequestSchema
>
export type RestoreIncomingOrderProposalResult = z.infer<
  typeof restoreIncomingOrderProposalResultSchema
>

export type OrderManagementPort = Readonly<{
  listIncomingOrders: (input: {
    locationId: string
    view: IncomingOrderView
    limit?: number
    cursor?: string | null
    signal?: AbortSignal
  }) => Promise<IncomingOrderProposalList>
  acceptIncomingOrder: (input: {
    locationId: string
    proposalId: string
    request: AcceptIncomingOrderProposalRequest
  }) => Promise<IncomingOrderProposalDecisionResult>
  rejectIncomingOrder: (input: {
    locationId: string
    proposalId: string
    request: RejectIncomingOrderProposalRequest
  }) => Promise<IncomingOrderProposalDecisionResult>
  restoreIncomingOrder: (input: {
    locationId: string
    proposalId: string
    request: RestoreIncomingOrderProposalRequest
  }) => Promise<RestoreIncomingOrderProposalResult>
}>
