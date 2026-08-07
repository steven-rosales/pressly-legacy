import {
  incomingOrderProposalDecisionResultSchema,
  incomingOrderProposalListSchema,
  restoreIncomingOrderProposalResultSchema,
} from "@pressly/contracts/orders"
import type { OrderManagementPort } from "@/ports/order-management.port"
import type { RequestPort } from "@/ports/request.port"

const proposalPath = (locationId: string, proposalId?: string): string => {
  const base = `/order-management/locations/${encodeURIComponent(locationId)}/incoming-orders`
  return proposalId === undefined
    ? base
    : `${base}/${encodeURIComponent(proposalId)}`
}

export const makeApiOrderManagementAdapter = (
  request: RequestPort
): OrderManagementPort => ({
  listIncomingOrders: ({
    locationId,
    view,
    limit = 100,
    cursor = null,
    signal,
  }) => {
    const query = new URLSearchParams({ limit: String(limit), view })
    if (cursor !== null) query.set("cursor", cursor)
    return request(
      {
        path: `${proposalPath(locationId)}?${query.toString()}`,
        ...(signal === undefined ? {} : { signal }),
      },
      incomingOrderProposalListSchema
    )
  },
  acceptIncomingOrder: ({ locationId, proposalId, request: body }) =>
    request(
      {
        method: "POST",
        path: `${proposalPath(locationId, proposalId)}/accept`,
        body,
      },
      incomingOrderProposalDecisionResultSchema
    ),
  rejectIncomingOrder: ({ locationId, proposalId, request: body }) =>
    request(
      {
        method: "POST",
        path: `${proposalPath(locationId, proposalId)}/reject`,
        body,
      },
      incomingOrderProposalDecisionResultSchema
    ),
  restoreIncomingOrder: ({ locationId, proposalId, request: body }) =>
    request(
      {
        method: "POST",
        path: `${proposalPath(locationId, proposalId)}/restore`,
        body,
      },
      restoreIncomingOrderProposalResultSchema
    ),
})
