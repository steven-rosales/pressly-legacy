import { describe, expect, it, vi } from "vitest"
import { makeApiOrderManagementAdapter } from "@/adapters/order-management/api-order-management.adapter"
import { testIncomingOrderProposal } from "../../fixtures/order-management.fixture"
import { testLocation } from "../../fixtures/production.fixture"

describe("order-management API gateway", () => {
  it("uses location-scoped incoming-order resources and keeps command bodies explicit", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        items: [testIncomingOrderProposal],
        nextCursor: "next-proposal",
      })
      .mockResolvedValueOnce({
        proposalId: testIncomingOrderProposal.id,
        state: "accepted",
        version: 2,
        orderId: "00000000-0000-4000-8000-000000000702",
        fulfillmentId: "00000000-0000-4000-8000-000000000703",
        replayed: false,
      })
      .mockResolvedValueOnce({
        proposalId: testIncomingOrderProposal.id,
        state: "rejected",
        version: 2,
        orderId: null,
        fulfillmentId: null,
        replayed: false,
      })
      .mockResolvedValueOnce({
        proposalId: testIncomingOrderProposal.id,
        state: "restored_pending",
        version: 3,
        replayed: false,
      })
    const gateway = makeApiOrderManagementAdapter(request)
    const controller = new AbortController()

    await gateway.listIncomingOrders({
      locationId: testLocation.id,
      view: "needs_review",
      limit: 25,
      cursor: "after-proposal",
      signal: controller.signal,
    })
    await gateway.acceptIncomingOrder({
      locationId: testLocation.id,
      proposalId: testIncomingOrderProposal.id,
      request: {
        expectedVersion: 1,
        idempotencyKey: "accept-proposal-1",
        reasonCode: "incoming_order_accepted",
        reasonNote: null,
      },
    })
    await gateway.rejectIncomingOrder({
      locationId: testLocation.id,
      proposalId: testIncomingOrderProposal.id,
      request: {
        expectedVersion: 1,
        idempotencyKey: "reject-proposal-1",
        reasonCode: "already_handled",
        reasonNote: null,
      },
    })
    await gateway.restoreIncomingOrder({
      locationId: testLocation.id,
      proposalId: testIncomingOrderProposal.id,
      request: {
        expectedVersion: 2,
        idempotencyKey: "restore-proposal-1",
        reasonCode: "source_closure_overridden",
        reasonNote: null,
      },
    })

    expect(request).toHaveBeenNthCalledWith(
      1,
      {
        path: `/order-management/locations/${testLocation.id}/incoming-orders?limit=25&view=needs_review&cursor=after-proposal`,
        signal: controller.signal,
      },
      expect.anything()
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      {
        method: "POST",
        path: `/order-management/locations/${testLocation.id}/incoming-orders/${testIncomingOrderProposal.id}/accept`,
        body: {
          expectedVersion: 1,
          idempotencyKey: "accept-proposal-1",
          reasonCode: "incoming_order_accepted",
          reasonNote: null,
        },
      },
      expect.anything()
    )
    expect(request).toHaveBeenNthCalledWith(
      3,
      {
        method: "POST",
        path: `/order-management/locations/${testLocation.id}/incoming-orders/${testIncomingOrderProposal.id}/reject`,
        body: {
          expectedVersion: 1,
          idempotencyKey: "reject-proposal-1",
          reasonCode: "already_handled",
          reasonNote: null,
        },
      },
      expect.anything()
    )
    expect(request).toHaveBeenNthCalledWith(
      4,
      {
        method: "POST",
        path: `/order-management/locations/${testLocation.id}/incoming-orders/${testIncomingOrderProposal.id}/restore`,
        body: {
          expectedVersion: 2,
          idempotencyKey: "restore-proposal-1",
          reasonCode: "source_closure_overridden",
          reasonNote: null,
        },
      },
      expect.anything()
    )
  })
})
