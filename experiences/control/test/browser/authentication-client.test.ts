import { unexpectedError } from "@pressly/errors/factories"
import { describe, expect, it, vi } from "vitest"
import {
  makeControlAuthenticationBrowserClient,
  type ControlBrowserRequest,
} from "../../src/browser.ts"
import { controlAuthenticationOperations } from "./operations.fixture.ts"

const fault = unexpectedError({
  code: "control_browser_auth_fault_fixture",
  message: "Control browser authentication fault fixture.",
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

describe("Control authentication browser client", () => {
  it("emits the four selected request vectors and preserves failures", async () => {
    const request = vi.fn().mockRejectedValue(fault)
    const client = makeControlAuthenticationBrowserClient({
      operations: controlAuthenticationOperations,
      request: request,
      acceptCsrfToken: vi.fn(),
      clearCsrfToken: vi.fn(),
    })
    const calls = [
      () => client.restore(),
      () => client.login({ email: "owner@example.com", password: "password" }),
      () => client.completeMfa({ method: "totp", code: "123456" }),
      () => client.logout(),
    ]
    const expectedRequests = [
      { method: "GET", path: "/control/auth/session" },
      {
        method: "POST",
        path: "/control/auth/login",
        body: { email: "owner@example.com", password: "password" },
      },
      {
        method: "POST",
        path: "/control/auth/mfa/challenge",
        body: { method: "totp", code: "123456" },
      },
      { method: "POST", path: "/control/auth/logout", csrf: true },
    ]

    for (const call of calls) await expect(call()).rejects.toBe(fault)
    for (let index = 0; index < calls.length; index += 1)
      expect(
        normalized(request.mock.calls[index]?.[0] as ControlBrowserRequest),
      ).toEqual(expectedRequests[index])
  })

  it("renders all seven additional authentication administration routes", async () => {
    const request = vi.fn().mockRejectedValue(fault)
    const client = makeControlAuthenticationBrowserClient({
      operations: controlAuthenticationOperations,
      request,
      acceptCsrfToken: vi.fn(),
      clearCsrfToken: vi.fn(),
    })
    const calls = [
      () => client.listIdentitySessions("identity/one"),
      () => client.revokeAllIdentitySessions("identity/one"),
      () =>
        client.revokeIdentitySession({
          identityId: "identity/one",
          sessionId: "session/one",
        }),
      () => client.beginMfaEnrollment(),
      () => client.confirmMfaEnrollment("123456"),
      () => client.regenerateRecoveryCodes(),
      () => client.removeMfa(),
    ]

    for (const call of calls) await expect(call()).rejects.toBe(fault)

    expect(request.mock.calls.map((call) => call[0])).toMatchObject([
      {
        method: "GET",
        path: "/control/auth/identities/identity%2Fone/sessions",
      },
      {
        method: "POST",
        path: "/control/auth/identities/identity%2Fone/sessions/revoke-all",
        csrf: true,
      },
      {
        method: "POST",
        path: "/control/auth/identities/identity%2Fone/sessions/session%2Fone/revoke",
        csrf: true,
      },
      { method: "POST", path: "/control/auth/mfa/enrollment", csrf: true },
      {
        method: "POST",
        path: "/control/auth/mfa/enrollment/confirm",
        body: { code: "123456" },
        csrf: true,
      },
      {
        method: "POST",
        path: "/control/auth/mfa/recovery-codes/regenerate",
        csrf: true,
      },
      { method: "POST", path: "/control/auth/mfa/remove", csrf: true },
    ])
  })

  it("matches the four live MFA administration request vectors", async () => {
    const request = vi.fn().mockRejectedValue(fault)
    const client = makeControlAuthenticationBrowserClient({
      operations: controlAuthenticationOperations,
      request: request,
      acceptCsrfToken: vi.fn(),
      clearCsrfToken: vi.fn(),
    })
    const calls = [
      () => client.beginMfaEnrollment(),
      () => client.confirmMfaEnrollment("123456"),
      () => client.regenerateRecoveryCodes(),
      () => client.removeMfa(),
    ]
    const expectedRequests = [
      { method: "POST", path: "/control/auth/mfa/enrollment", csrf: true },
      {
        method: "POST",
        path: "/control/auth/mfa/enrollment/confirm",
        body: { code: "123456" },
        csrf: true,
      },
      {
        method: "POST",
        path: "/control/auth/mfa/recovery-codes/regenerate",
        csrf: true,
      },
      { method: "POST", path: "/control/auth/mfa/remove", csrf: true },
    ]

    for (const call of calls) await expect(call()).rejects.toBe(fault)
    for (let index = 0; index < calls.length; index += 1)
      expect(
        normalized(request.mock.calls[index]?.[0] as ControlBrowserRequest),
      ).toEqual(expectedRequests[index])
  })

  it("preserves ISO wire values, accepts CSRF proof, and retains the application allowlist", async () => {
    const serialized = {
      status: "authenticated",
      principal: {
        identityId: "00000000-0000-4000-8000-000000000001",
        displayName: "Owner One",
      },
      access: {
        business: {
          id: "00000000-0000-4000-8000-000000000002",
          name: "Pressly One",
        },
        locations: [],
        selectedLocationId: null,
        capabilities: ["control:view"],
        applications: [
          {
            id: "control",
            label: "Pressly Control",
            description: "Manage Pressly.",
            href: "https://control.trypressly.com/",
          },
        ],
      },
      expiresAt: "2026-08-24T20:00:00.000Z",
      csrfToken: "a".repeat(43),
    } as const
    const request = vi.fn(async (_request, codec) => {
      const decoded = codec.decode(serialized)
      if (decoded.kind === "invalid") throw fault
      return decoded.value
    })
    const acceptCsrfToken = vi.fn()
    const client = makeControlAuthenticationBrowserClient({
      operations: controlAuthenticationOperations,
      request,
      acceptCsrfToken,
      clearCsrfToken: vi.fn(),
    })

    const session = await client.restore()
    expect(session.expiresAt).toBe(serialized.expiresAt)
    expect(acceptCsrfToken).toHaveBeenCalledWith(serialized.csrfToken)

    request.mockImplementationOnce(async (_request, codec) => {
      const decoded = codec.decode({
        ...serialized,
        access: {
          ...serialized.access,
          applications: [
            {
              ...serialized.access.applications[0],
              href: "https://attacker.example/",
            },
          ],
        },
      })
      if (decoded.kind === "invalid") throw fault
      return decoded.value
    })
    await expect(client.restore()).rejects.toBe(fault)
  })
})
