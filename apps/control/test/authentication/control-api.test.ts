import { describe, expect, it, vi } from "vitest"
import {
  ControlApiError,
  makeControlAuthenticationApi,
} from "@/authentication/control-api"

const session = {
  status: "authenticated" as const,
  principal: {
    identityId: "8a283721-7ff9-4d18-a497-e3a0dca576b7",
    displayName: "Olivia Press",
  },
  access: {
    business: {
      id: "404d5ca3-72cb-4ed8-8fbf-95b6a371a9a6",
      name: "Pressly One",
    },
    locations: [],
    selectedLocationId: null,
    capabilities: [],
    applications: [],
  },
  expiresAt: "2026-07-30T12:00:00.000Z",
  csrfToken: "a".repeat(43),
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

describe("Control authentication API", () => {
  it("unwraps successful API envelopes", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        data: session,
      }),
    )
    const api = makeControlAuthenticationApi({
      apiBaseUrl: "/api",
      fetchImplementation,
    })

    await expect(api.restore()).resolves.toEqual(session)
    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/control/auth/session",
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
      }),
    )
  })

  it("rejects malformed envelopes before parsing session data", async () => {
    const api = makeControlAuthenticationApi({
      fetchImplementation: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ data: session })),
    })

    await expect(api.restore()).rejects.toMatchObject({
      name: "ControlApiError",
      kind: "unreadable_response",
    })
  })

  it("surfaces bounded failure envelopes without treating them as data", async () => {
    const api = makeControlAuthenticationApi({
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(
          {
            ok: false,
            error: {
              code: "AUTH_INVALID_CREDENTIALS",
              message: "The email or password is incorrect.",
            },
          },
          401,
        ),
      ),
    })

    await expect(api.restore()).rejects.toEqual(
      expect.objectContaining<Partial<ControlApiError>>({
        status: 401,
        kind: "authentication_required",
        code: "AUTH_INVALID_CREDENTIALS",
      }),
    )
  })

  it("sends the in-memory CSRF token when signing out", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: session }))
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, data: { revoked: true } }),
      )
    const api = makeControlAuthenticationApi({ fetchImplementation })

    await api.restore()
    await api.logout()

    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      "/api/control/auth/logout",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-CSRF-Token": session.csrfToken,
        }),
      }),
    )
  })
})
