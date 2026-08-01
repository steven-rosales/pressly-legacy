import { describe, expect, it, vi } from "vitest"
import { makeControlHttpClient } from "@/api/control-http-client"
import { makeControlSecurityApi } from "@/features/security/security-api"

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const event = {
  id: "f24f3d2a-f915-4e79-90be-1f60b9e67127",
  eventType: "auth.workforce_session_revoked",
  resourceType: "workforce_membership",
  actorDisplayName: "Olivia Press",
  createdAt: "2026-08-01T12:00:00.000Z",
}

describe("Control security API", () => {
  it("requests a bounded, cursor-encoded audit page", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        data: { events: [event], nextCursor: null },
      }),
    )

    await expect(
      makeControlSecurityApi(
        makeControlHttpClient({ fetchImplementation }),
      ).listSecurityEvents("cursor/value?"),
    ).resolves.toEqual({ events: [event], nextCursor: null })

    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/control/security/events?limit=25&cursor=cursor%2Fvalue%3F",
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
      }),
    )
  })

  it("rejects an audit response that leaks uncontracted metadata", async () => {
    const api = makeControlSecurityApi(
      makeControlHttpClient({
        fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
          jsonResponse({
            ok: true,
            data: {
              events: [{ ...event, metadata: { invitationToken: "secret" } }],
              nextCursor: null,
            },
          }),
        ),
      }),
    )

    await expect(api.listSecurityEvents()).rejects.toMatchObject({
      kind: "unreadable_response",
    })
  })
})
