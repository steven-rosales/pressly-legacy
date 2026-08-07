import { describe, expect, it, vi } from "vitest"
import { makeControlAuthenticationApi } from "@/authentication/control-api"
import {
  makeControlHttpClient,
  type ControlApiError,
} from "@/api/control-http-client"
import { z } from "zod"

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

  it("accepts canonical success metadata", async () => {
    const api = makeControlAuthenticationApi({
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({
          ok: true,
          data: session,
          meta: { source: "session" },
        }),
      ),
    })

    await expect(api.restore()).resolves.toEqual(session)
  })

  it("rejects success envelopes carried by unsuccessful HTTP statuses", async () => {
    const response = new Response(JSON.stringify({ ok: true, data: session }), {
      status: 409,
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "mismatched-status-request",
      },
    })
    const api = makeControlAuthenticationApi({
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(response),
    })

    await expect(api.restore()).rejects.toMatchObject({
      status: 502,
      kind: "ExternalServiceError",
      controlKind: "unreadable_response",
      code: "control_status_envelope_mismatch",
      traceId: "mismatched-status-request",
    })
  })

  it("classifies local body encoding failures before transport", async () => {
    const fetchImplementation = vi.fn<typeof fetch>()
    const client = makeControlHttpClient({ fetchImplementation })

    await expect(
      client.request(
        {
          method: "POST",
          path: "/example",
          body: { value: 1n },
        },
        z.unknown(),
      ),
    ).rejects.toMatchObject({
      status: 400,
      kind: "ValidationError",
      controlKind: "invalid_request",
      code: "control_request_body_not_serializable",
      cause: expect.any(TypeError),
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it("rejects malformed envelopes before parsing session data", async () => {
    const api = makeControlAuthenticationApi({
      fetchImplementation: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ data: session })),
    })

    await expect(api.restore()).rejects.toMatchObject({
      name: "ExternalServiceError",
      kind: "ExternalServiceError",
      controlKind: "unreadable_response",
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
        kind: "AuthError",
        controlKind: "authentication_required",
        code: "AUTH_INVALID_CREDENTIALS",
      }),
    )
  })

  it("rejects incomplete failure envelopes and preserves request references", async () => {
    const response = new Response(
      JSON.stringify({ ok: false, error: { code: "INCOMPLETE" } }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": "request-control-123",
        },
      },
    )
    const api = makeControlAuthenticationApi({
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(response),
    })

    await expect(api.restore()).rejects.toMatchObject({
      kind: "ExternalServiceError",
      controlKind: "unreadable_response",
      traceId: "request-control-123",
      cause: expect.any(Error),
    })
  })

  it("falls back to the response request ID for canonical API failures", async () => {
    const response = new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "AUTH_INVALID_CREDENTIALS",
          message: "The email or password is incorrect.",
        },
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": "request-control-456",
        },
      },
    )
    const api = makeControlAuthenticationApi({
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(response),
    })

    await expect(api.restore()).rejects.toMatchObject({
      traceId: "request-control-456",
      tag: "AppError",
      kind: "AuthError",
      controlKind: "authentication_required",
    })
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
