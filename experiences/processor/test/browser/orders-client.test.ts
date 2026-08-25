import {
  incomingOrderProposalDecisionHttpResultSchema,
  incomingOrderProposalListHttpResultSchema,
  restoreIncomingOrderProposalHttpResultSchema,
} from "@pressly/orders-system/http/order-management"
import { unexpectedError } from "@pressly/errors/factories"
import { describe, expect, it, vi } from "vitest"
import {
  makeProcessorOrdersBrowserClient,
  type OrderManagementPort,
  type ProcessorBrowserRequest,
  type ProcessorOrderOperations,
  type ProcessorOrdersBrowserClient,
} from "../../src/browser.ts"

const contract = Object.freeze({
  inputVersion: 1,
  outputVersion: 1,
  failureVersion: 1,
})

const operations = {
  listIncomingOrders: {
    operationId: "orders.list-incoming-order-proposals.v1",
    contract,
    http: {
      "incoming-orders": {
        method: "GET",
        path: "/order-management/locations/:locationId/incoming-orders",
      },
    },
  },
  acceptIncomingOrder: {
    operationId: "orders.accept-incoming-order-proposal.v1",
    contract,
    http: {
      accept: {
        method: "POST",
        path: "/order-management/locations/:locationId/incoming-orders/:proposalId/accept",
      },
    },
  },
  rejectIncomingOrder: {
    operationId: "orders.reject-incoming-order-proposal.v1",
    contract,
    http: {
      reject: {
        method: "POST",
        path: "/order-management/locations/:locationId/incoming-orders/:proposalId/reject",
      },
    },
  },
  restoreIncomingOrder: {
    operationId: "orders.restore-incoming-order-proposal.v1",
    contract,
    http: {
      restore: {
        method: "POST",
        path: "/order-management/locations/:locationId/incoming-orders/:proposalId/restore",
      },
    },
  },
} as const satisfies ProcessorOrderOperations

const fault = unexpectedError({
  code: "processor_orders_browser_fault_fixture",
  message: "Processor Orders browser fault fixture.",
})

const normalized = (
  request: Readonly<{
    method?: string
    path: string
    body?: unknown
    signal?: AbortSignal
  }>
) => ({
  method: request.method ?? "GET",
  path: request.path,
  ...(request.body === undefined ? {} : { body: request.body }),
  ...(request.signal === undefined ? {} : { signal: request.signal }),
})

const proposalRequest = {
  expectedVersion: 1,
  idempotencyKey: "proposal-command-1",
  reasonCode: "incoming_order_accepted" as const,
  reasonNote: null,
}

type SameKeys<Left, Right> =
  Exclude<keyof Left, keyof Right> extends never
    ? Exclude<keyof Right, keyof Left> extends never
      ? true
      : false
    : false

const clientMatchesPort: SameKeys<
  ProcessorOrdersBrowserClient,
  OrderManagementPort
> = true

describe("Processor Orders browser client", () => {
  it("has exactly the four methods consumed by the live app port", () => {
    const client = makeProcessorOrdersBrowserClient({
      operations,
      request: vi.fn(),
    })

    expect(clientMatchesPort).toBe(true)
    expect(Object.keys(client).sort()).toEqual([
      "acceptIncomingOrder",
      "listIncomingOrders",
      "rejectIncomingOrder",
      "restoreIncomingOrder",
    ])
  })

  it("emits the four selected adapter requests including cancellation", async () => {
    const request = vi.fn().mockRejectedValue(fault)
    const client = makeProcessorOrdersBrowserClient({
      operations,
      request: request,
    })
    const signal = new AbortController().signal
    const calls = [
      () =>
        client.listIncomingOrders({
          locationId: "location/one",
          view: "needs_review",
          limit: 25,
          cursor: "cursor/one",
          signal,
        }),
      () =>
        client.acceptIncomingOrder({
          locationId: "location/one",
          proposalId: "proposal/one",
          request: proposalRequest,
        }),
      () =>
        client.rejectIncomingOrder({
          locationId: "location/one",
          proposalId: "proposal/one",
          request: {
            ...proposalRequest,
            reasonCode: "already_handled",
          },
        }),
      () =>
        client.restoreIncomingOrder({
          locationId: "location/one",
          proposalId: "proposal/one",
          request: {
            ...proposalRequest,
            reasonCode: "source_closure_overridden",
          },
        }),
    ]
    const expectedRequests = [
      {
        method: "GET",
        path: "/order-management/locations/location%2Fone/incoming-orders?limit=25&view=needs_review&cursor=cursor%2Fone",
        signal,
      },
      {
        method: "POST",
        path: "/order-management/locations/location%2Fone/incoming-orders/proposal%2Fone/accept",
        body: proposalRequest,
      },
      {
        method: "POST",
        path: "/order-management/locations/location%2Fone/incoming-orders/proposal%2Fone/reject",
        body: { ...proposalRequest, reasonCode: "already_handled" },
      },
      {
        method: "POST",
        path: "/order-management/locations/location%2Fone/incoming-orders/proposal%2Fone/restore",
        body: {
          ...proposalRequest,
          reasonCode: "source_closure_overridden",
        },
      },
    ]

    for (const call of calls) await expect(call()).rejects.toBe(fault)

    for (let index = 0; index < calls.length; index += 1)
      expect(
        normalized(request.mock.calls[index]?.[0] as ProcessorBrowserRequest)
      ).toEqual(expectedRequests[index])
  })

  it("returns strict owner wire values without converting ISO bytes to Dates", async () => {
    const serialized = {
      items: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          version: 1,
          state: "pending",
          source: "cents",
          externalOrderId: "external-1",
          locationId: "location-1",
          displayNumber: null,
          customer: null,
          dueAt: "2026-08-24T20:00:00.000Z",
          estimatedWeightLbs: 20,
          sourceReportedAt: "2026-08-22T18:00:00.000Z",
          reportedAt: "2026-08-22T18:01:00.000Z",
          sourceClosure: null,
          availableActions: ["accept", "reject"],
          acceptBlockedReason: null,
        },
      ],
      nextCursor: null,
    }

    const request = vi.fn(async (_request, codec) => {
      const decoded = codec.decode(serialized)
      if (decoded.kind === "invalid") throw fault
      return decoded.value
    })
    const client = makeProcessorOrdersBrowserClient({ operations, request })

    const result = await client.listIncomingOrders({
      locationId: "location-1",
      view: "needs_review",
    })

    expect(result).toEqual(serialized)
    expect(result.items[0]?.dueAt).toBe(serialized.items[0]?.dueAt)
    expect(
      incomingOrderProposalListHttpResultSchema.safeParse(serialized).success
    ).toBe(true)
    expect(
      incomingOrderProposalListHttpResultSchema.safeParse({
        ...serialized,
        leaked: true,
      }).success
    ).toBe(false)
    expect(incomingOrderProposalDecisionHttpResultSchema).toBeDefined()
    expect(restoreIncomingOrderProposalHttpResultSchema).toBeDefined()
  })
})
