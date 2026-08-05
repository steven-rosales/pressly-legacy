import { describe, expect, it, vi } from "vitest"
import type { ControlOrderDetail } from "@pressly/contracts/orders"
import { makeControlHttpClient } from "@/api/control-http-client"
import { makeControlOrderApi } from "@/features/orders/order-api"

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const order: ControlOrderDetail = {
  id: "15f669cf-f916-44b9-b033-0e5f9bfb2b3f",
  version: 4,
  displayNumber: "21122",
  state: "open",
  dueAt: "2026-07-31T21:00:00.000Z",
  currency: "USD",
  totalAmountCents: 4200,
  balanceDueCents: 1200,
  customer: {
    resolution: "resolved",
    userId: "5e03eb58-bfa3-435b-9c68-1f0ffc9bcb2a",
    displayName: "Santiago Jackson",
    phone: "+12015550101",
    email: "santiago@example.com",
  },
  fulfillment: {
    id: "c20e9bd9-1580-4518-988e-2d2ae6c9711d",
    version: 2,
    typeCode: "wash_fold",
    locationId: "laundry-production",
    releaseState: "unreleased",
    estimatedWeightLbs: 17,
    estimatedWeightSource: "control_manager_entry",
    bagCount: null,
  },
  items: [],
  createdAt: "2026-07-30T12:00:00.000Z",
  updatedAt: "2026-07-30T13:00:00.000Z",
}

describe("Control order API", () => {
  it("encodes search, state, location, and cursor filters", async () => {
    const { items: omittedItems, ...orderSummary } = order
    void omittedItems
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        data: { items: [orderSummary], nextCursor: null },
      }),
    )
    const api = makeControlOrderApi(
      makeControlHttpClient({ fetchImplementation }),
    )

    await api.list({
      query: "Santiago + 21122",
      state: "open",
      locationId: "laundry/production",
      cursor: "cursor/current",
      limit: 25,
    })

    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/control/orders?query=Santiago+%2B+21122&state=open&locationId=laundry%2Fproduction&cursor=cursor%2Fcurrent&limit=25",
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    )
  })

  it("creates an unreleased source-neutral order for an exact customer", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          orderId: order.id,
          fulfillmentId: order.fulfillment.id,
          version: 1,
          replayed: false,
        },
      }),
    )
    const client = makeControlHttpClient({ fetchImplementation })
    client.acceptCsrfToken("c".repeat(43))
    const api = makeControlOrderApi(client)

    await api.create({
      customerId: order.customer.userId!,
      displayNumber: order.displayNumber,
      dueAt: order.dueAt,
      totalAmountCents: 4200,
      balanceDueCents: 1200,
      locationId: order.fulfillment.locationId,
      estimatedWeightLbs: 17,
    })

    const body = JSON.parse(
      String(fetchImplementation.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>
    expect(body).toMatchObject({
      customer: {
        resolution: "resolved",
        userId: order.customer.userId,
      },
      reasonCode: "new_customer_order",
      items: [],
      fulfillment: {
        typeCode: "wash_fold",
        locationId: "laundry-production",
        estimatedWeightLbs: 17,
        estimatedWeightSource: "control_manager_entry",
      },
      idempotencyKey: expect.any(String),
    })
    expect(body).not.toHaveProperty("state")
    expect(body).not.toHaveProperty("releaseState")
  })

  it("corrects descriptive facts with both optimistic versions and no lifecycle command", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          orderId: order.id,
          fulfillmentId: order.fulfillment.id,
          version: 5,
          replayed: false,
        },
      }),
    )
    const client = makeControlHttpClient({ fetchImplementation })
    client.acceptCsrfToken("c".repeat(43))
    const api = makeControlOrderApi(client)

    await api.correct({
      order,
      customerId: order.customer.userId!,
      displayNumber: "21122-A",
      dueAt: "2026-08-01T21:00:00.000Z",
      totalAmountCents: 4400,
      balanceDueCents: 1400,
      estimatedWeightLbs: null,
      reasonNote: "Customer confirmed the corrected due date.",
    })

    const request = fetchImplementation.mock.calls[0]
    expect(request?.[0]).toBe(`/api/control/orders/${order.id}`)
    expect(request?.[1]).toEqual(expect.objectContaining({ method: "PATCH" }))
    const body = JSON.parse(String(request?.[1]?.body)) as Record<
      string,
      unknown
    >
    expect(body).toMatchObject({
      reasonCode: "manager_correction",
      expectedOrderVersion: 4,
      expectedFulfillmentVersion: 2,
      changes: {
        displayNumber: "21122-A",
        fulfillment: {
          estimatedWeight: { lbs: null, source: null },
        },
      },
    })
    expect(body).not.toHaveProperty("state")
    expect(body).not.toHaveProperty("releaseState")
  })
})
