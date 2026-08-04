import { describe, expect, it, vi } from "vitest"
import { makeControlHttpClient } from "@/api/control-http-client"
import { makeControlCustomerApi } from "@/features/customers/customer-api"

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const customer = {
  id: "5e03eb58-bfa3-435b-9c68-1f0ffc9bcb2a",
  version: 3,
  active: true,
  firstName: "Santiago",
  lastName: "Jackson",
  businessName: null,
  phone: "+12015550101",
  email: "santiago@example.com",
  displayName: "Santiago Jackson",
  possibleDuplicateCount: 0,
  createdAt: "2026-07-30T12:00:00.000Z",
  updatedAt: "2026-07-30T13:00:00.000Z",
}

describe("Control customer API", () => {
  it("encodes scoped search and cursor parameters", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        data: { items: [customer], nextCursor: "cursor/next" },
      }),
    )
    const api = makeControlCustomerApi(
      makeControlHttpClient({ fetchImplementation }),
    )

    await expect(
      api.list({
        query: "Santiago + Jackson",
        active: true,
        cursor: "cursor/current",
        limit: 25,
      }),
    ).resolves.toMatchObject({ items: [customer] })

    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/control/customers?query=Santiago+%2B+Jackson&active=true&cursor=cursor%2Fcurrent&limit=25",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    )
  })

  it("creates and corrects a customer with CSRF and optimistic versions", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        jsonResponse({
          ok: true,
          data: { userId: customer.id, version: 4, replayed: false },
        }),
      )
    const client = makeControlHttpClient({ fetchImplementation })
    client.acceptCsrfToken("c".repeat(43))
    const api = makeControlCustomerApi(client)
    const profile = {
      firstName: "Santiago",
      lastName: "Jackson",
      businessName: null,
      phone: "+12015550101",
      email: "santiago@example.com",
    }

    await api.create(profile)
    await api.update({
      customerId: customer.id,
      expectedVersion: 3,
      changes: { phone: "+12015550102", active: true },
    })

    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      "/api/control/customers",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-CSRF-Token": "c".repeat(43),
        }),
      }),
    )
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      `/api/control/customers/${customer.id}`,
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          "X-CSRF-Token": "c".repeat(43),
        }),
      }),
    )
    const correction = JSON.parse(
      String(fetchImplementation.mock.calls[1]?.[1]?.body),
    ) as Record<string, unknown>
    expect(correction).toMatchObject({
      expectedVersion: 3,
      changes: { phone: "+12015550102", active: true },
      idempotencyKey: expect.any(String),
    })
  })

  it("rejects malformed customer data instead of rendering it", async () => {
    const api = makeControlCustomerApi(
      makeControlHttpClient({
        fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
          jsonResponse({
            ok: true,
            data: {
              items: [{ ...customer, possibleDuplicateCount: -1 }],
              nextCursor: null,
            },
          }),
        ),
      }),
    )

    await expect(
      api.list({ query: "", active: null, cursor: null }),
    ).rejects.toMatchObject({
      controlKind: "unreadable_response",
    })
  })
})
