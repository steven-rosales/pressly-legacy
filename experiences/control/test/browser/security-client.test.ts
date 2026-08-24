import { unexpectedError } from "@pressly/errors/factories"
import { describe, expect, it, vi } from "vitest"
import {
  makeControlSecurityBrowserClient,
  type ControlBrowserRequest,
} from "../../src/browser.ts"
import { controlSecurityOperations } from "./operations.fixture.ts"

const fault = unexpectedError({
  code: "control_browser_security_fault_fixture",
  message: "Control browser security fault fixture.",
})

describe("Control security-event browser client", () => {
  it("matches the live request vector and preserves failure identity", async () => {
    const request = vi.fn().mockRejectedValue(fault)
    const client = makeControlSecurityBrowserClient({
      operations: controlSecurityOperations,
      request: request,
    })

    await expect(client.listSecurityEvents("cursor/one")).rejects.toBe(fault)
    expect(request.mock.calls[0]?.[0] as ControlBrowserRequest).toEqual({
      method: "GET",
      path: "/control/security/events?limit=25&cursor=cursor%2Fone",
    })
  })

  it("returns the same strict serialized event page without Date conversion", async () => {
    const serialized = {
      events: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          eventType: "auth.session.revoked",
          resourceType: "identity",
          actorDisplayName: "Owner One",
          createdAt: "2026-08-20T12:00:00.000Z",
        },
      ],
      nextCursor: null,
    } as const
    const request = vi.fn(async (_request, codec) => {
      const decoded = codec.decode(serialized)
      if (decoded.kind === "invalid") throw fault
      return decoded.value
    })
    const client = makeControlSecurityBrowserClient({
      operations: controlSecurityOperations,
      request: request,
    })

    const result = await client.listSecurityEvents()

    expect(result).toEqual(serialized)
    expect(result.events[0]?.createdAt).toBe(serialized.events[0].createdAt)
  })
})
