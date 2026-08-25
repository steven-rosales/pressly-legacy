import type { ControlOrderDetail } from "../../src/browser/contracts/orders.ts"
import { unexpectedError } from "@pressly/errors/factories"
import { describe, expect, it, vi } from "vitest"
import {
  makeControlOrdersBrowserClient,
  type ControlBrowserRequest,
} from "../../src/browser.ts"
import { controlOrderOperations } from "./operations.fixture.ts"

const fault = unexpectedError({
  code: "control_browser_orders_fault_fixture",
  message: "Control browser Orders fault fixture.",
})

const normalized = (
  request: Readonly<{
    method?: string
    path: string
    body?: unknown
    csrf?: boolean
  }>,
) => ({
  method: request.method ?? "GET",
  path: request.path,
  ...(request.body === undefined ? {} : { body: request.body }),
  ...(request.csrf === true ? { csrf: true } : {}),
})

const order = {
  id: "00000000-0000-4000-8000-000000000001",
  version: 2,
  displayNumber: "ORD-1001",
  state: "open",
  dueAt: "2026-08-24T20:00:00.000Z",
  currency: "USD",
  totalAmountCents: 4_500,
  balanceDueCents: 2_000,
  customer: {
    resolution: "resolved",
    userId: "00000000-0000-4000-8000-000000000002",
    displayName: "Ada Lovelace",
    phone: "+12125550123",
    email: "ada@example.com",
  },
  fulfillment: {
    id: "00000000-0000-4000-8000-000000000003",
    version: 3,
    typeCode: "wash_fold",
    locationId: "pressly-one",
    releaseState: "unreleased",
    estimatedWeightLbs: 20,
    estimatedWeightSource: "control_manager_entry",
  },
  createdAt: "2026-08-20T12:00:00.000Z",
  updatedAt: "2026-08-21T12:00:00.000Z",
  items: [],
} as const satisfies ControlOrderDetail

describe("Control Orders browser client", () => {
  it("matches all four live request vectors and preserves failures", async () => {
    const key = "00000000-0000-4000-8000-000000000004"
    const request = vi.fn().mockRejectedValue(fault)
    const client = makeControlOrdersBrowserClient({
      operations: controlOrderOperations,
      request: request,
      idempotencyKey: () => key,
    })
    const calls = [
      client.list({
        query: "  ORD-1001  ",
        state: "open",
        locationId: "pressly/one",
        cursor: "cursor/one",
        limit: 30,
      }),
      client.get("order/one"),
      client.create({
        customerId: "00000000-0000-4000-8000-000000000002",
        displayNumber: "ORD-1002",
        dueAt: "2026-08-25T20:00:00.000Z",
        totalAmountCents: 5_000,
        balanceDueCents: null,
        locationId: "pressly-one",
        estimatedWeightLbs: 22,
      }),
      client.correct({
        order,
        customerId: "00000000-0000-4000-8000-000000000002",
        displayNumber: null,
        dueAt: "2026-08-26T20:00:00.000Z",
        totalAmountCents: 5_500,
        balanceDueCents: 1_000,
        estimatedWeightLbs: null,
        reasonNote: "Corrected by manager.",
      }),
    ]

    for (const call of calls) await expect(call).rejects.toBe(fault)
    expect(
      request.mock.calls.map((call) =>
        normalized(call[0] as ControlBrowserRequest),
      ),
    ).toMatchObject([
      {
        method: "GET",
        path: "/control/orders?query=ORD-1001&state=open&locationId=pressly%2Fone&cursor=cursor%2Fone&limit=30",
      },
      { method: "GET", path: "/control/orders/order%2Fone" },
      {
        method: "POST",
        path: "/control/orders",
        csrf: true,
        body: {
          idempotencyKey: key,
          reasonCode: "new_customer_order",
          displayNumber: "ORD-1002",
        },
      },
      {
        method: "PATCH",
        path: `/control/orders/${order.id}`,
        csrf: true,
        body: {
          idempotencyKey: key,
          expectedOrderVersion: 2,
          expectedFulfillmentVersion: 3,
          reasonCode: "manager_correction",
        },
      },
    ])
  })

  it("returns the same strict serialized detail without Date conversion", async () => {
    const request = vi.fn(async (_request, codec) => {
      const decoded = codec.decode(order)
      if (decoded.kind === "invalid") throw fault
      return decoded.value
    })
    const client = makeControlOrdersBrowserClient({
      operations: controlOrderOperations,
      request: request,
      idempotencyKey: () => "unused-key",
    })

    const result = await client.get(order.id)

    expect(result).toEqual(order)
    expect(result.dueAt).toBe(order.dueAt)
    expect(result.createdAt).toBe(order.createdAt)
  })
})
