import { unexpectedError } from "@pressly/errors/factories"
import { describe, expect, it, vi } from "vitest"
import {
  makeControlCustomersBrowserClient,
  type ControlBrowserRequest,
} from "../../src/browser.ts"
import { controlCustomerOperations } from "./operations.fixture.ts"

const fault = unexpectedError({
  code: "control_browser_customers_fault_fixture",
  message: "Control browser customers fault fixture.",
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

describe("Control customers browser client", () => {
  it("matches all four live request vectors and preserves failures", async () => {
    const key = "00000000-0000-4000-8000-000000000001"
    const request = vi.fn().mockRejectedValue(fault)
    const client = makeControlCustomersBrowserClient({
      operations: controlCustomerOperations,
      request: request,
      idempotencyKey: () => key,
    })
    const profile = {
      firstName: "Ada",
      lastName: "Lovelace",
      businessName: null,
      phone: "+12125550123",
      email: "ada@example.com",
    }
    const calls = [
      () =>
        client.list({
          query: "  Ada Lovelace  ",
          active: true,
          cursor: "cursor/one",
          limit: 30,
        }),
      () => client.get("customer/one"),
      () => client.create(profile),
      () =>
        client.update({
          customerId: "customer/one",
          expectedVersion: 2,
          changes: { firstName: "Grace", active: false },
        }),
    ]
    const expectedRequests = [
      {
        method: "GET",
        path: "/control/customers?query=Ada+Lovelace&active=true&cursor=cursor%2Fone&limit=30",
      },
      { method: "GET", path: "/control/customers/customer%2Fone" },
      {
        method: "POST",
        path: "/control/customers",
        body: { idempotencyKey: key, profile },
        csrf: true,
      },
      {
        method: "PATCH",
        path: "/control/customers/customer%2Fone",
        body: {
          idempotencyKey: key,
          expectedVersion: 2,
          changes: { firstName: "Grace", active: false },
        },
        csrf: true,
      },
    ]

    for (const call of calls) await expect(call()).rejects.toBe(fault)
    for (let index = 0; index < calls.length; index += 1)
      expect(
        normalized(request.mock.calls[index]?.[0] as ControlBrowserRequest),
      ).toEqual(expectedRequests[index])
  })

  it("returns the same strict serialized customer page without Date conversion", async () => {
    const serialized = {
      items: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          version: 1,
          active: true,
          displayName: "Ada Lovelace",
          possibleDuplicateCount: 0,
          firstName: "Ada",
          lastName: "Lovelace",
          businessName: null,
          phone: "+12125550123",
          email: "ada@example.com",
          createdAt: "2026-08-20T12:00:00.000Z",
          updatedAt: "2026-08-21T12:00:00.000Z",
        },
      ],
      nextCursor: null,
    } as const
    const request = vi.fn(async (_request, codec) => {
      const decoded = codec.decode(serialized)
      if (decoded.kind === "invalid") throw fault
      return decoded.value
    })
    const client = makeControlCustomersBrowserClient({
      operations: controlCustomerOperations,
      request: request,
      idempotencyKey: () => "unused-key",
    })
    const listInput = {
      query: "",
      active: null,
      cursor: null,
    }

    const result = await client.list(listInput)

    expect(result).toEqual(serialized)
    expect(result.items[0]?.createdAt).toBe(serialized.items[0].createdAt)
  })
})
