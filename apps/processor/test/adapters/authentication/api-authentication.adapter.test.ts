import { describe, expect, it, vi } from "vitest"
import { makeApiAuthenticationAdapter } from "@/adapters/authentication/api-authentication.adapter"

const authenticated = {
  status: "authenticated" as const,
  principal: {
    identityId: "00000000-0000-4000-8000-000000000001",
    displayName: "Operator One",
    email: "operator@example.com",
    roles: ["operator" as const],
  },
  expiresAt: "2026-08-01T20:00:00.000Z",
  csrfToken: "a".repeat(43),
}

describe("processor authentication gateway", () => {
  it("keeps reusable credentials out of requests and accepts only the CSRF proof", async () => {
    const acceptCsrfToken = vi.fn()
    const request = vi.fn().mockResolvedValue(authenticated)
    const authentication = makeApiAuthenticationAdapter({
      request,
      acceptCsrfToken,
      clearCsrfToken: vi.fn(),
    })

    await expect(authentication.restore()).resolves.toEqual(authenticated)
    expect(request).toHaveBeenCalledWith(
      { path: "/processor/auth/session" },
      expect.anything()
    )
    expect(acceptCsrfToken).toHaveBeenCalledWith(authenticated.csrfToken)
    expect(JSON.stringify(request.mock.calls)).not.toMatch(
      /accessToken|challengeToken/
    )
  })

  it("submits MFA codes without exposing the server-held challenge", async () => {
    const request = vi.fn().mockResolvedValue(authenticated)
    const authentication = makeApiAuthenticationAdapter({
      request,
      acceptCsrfToken: vi.fn(),
      clearCsrfToken: vi.fn(),
    })

    await authentication.completeMfa({ method: "totp", code: "123456" })
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/processor/auth/mfa/challenge",
        body: { method: "totp", code: "123456" },
      }),
      expect.anything()
    )
  })
})
