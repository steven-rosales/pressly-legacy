import { unexpectedError } from "@pressly/errors/factories"
import { describe, expect, it, vi } from "vitest"
import {
  makeProcessorAuthenticationBrowserClient,
  type ProcessorAuthenticationOperations,
  type ProcessorBrowserRequest,
} from "../../src/browser.ts"

const contract = Object.freeze({
  inputVersion: 1,
  outputVersion: 1,
  failureVersion: 1,
})

const operations = {
  login: {
    operationId: "processor.auth-login.v1",
    contract,
    http: { login: { method: "POST", path: "/processor/auth/login" } },
  },
  completeMfaChallenge: {
    operationId: "processor.complete-mfa-challenge.v1",
    contract,
    http: {
      challenge: {
        method: "POST",
        path: "/processor/auth/mfa/challenge",
      },
    },
  },
  loadSession: {
    operationId: "processor.load-auth-session.v1",
    contract,
    http: { session: { method: "GET", path: "/processor/auth/session" } },
  },
  logout: {
    operationId: "processor.logout.v1",
    contract,
    http: { logout: { method: "POST", path: "/processor/auth/logout" } },
  },
} as const satisfies ProcessorAuthenticationOperations

const normalized = (
  request: Readonly<{ method?: string; path: string; body?: unknown }>
) => ({
  method: request.method ?? "GET",
  path: request.path,
  ...(request.body === undefined ? {} : { body: request.body }),
})

const fault = unexpectedError({
  code: "processor_browser_auth_fault_fixture",
  message: "Processor browser authentication fault fixture.",
})

describe("Processor authentication browser client", () => {
  it("emits all four selected request vectors and preserves failures", async () => {
    const request = vi.fn().mockRejectedValue(fault)
    const client = makeProcessorAuthenticationBrowserClient({
      operations,
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
      { method: "GET", path: "/processor/auth/session" },
      {
        method: "POST",
        path: "/processor/auth/login",
        body: { email: "owner@example.com", password: "password" },
      },
      {
        method: "POST",
        path: "/processor/auth/mfa/challenge",
        body: { method: "totp", code: "123456" },
      },
      { method: "POST", path: "/processor/auth/logout" },
    ]

    for (const call of calls) await expect(call()).rejects.toBe(fault)

    for (let index = 0; index < 4; index += 1) {
      const requestInput = request.mock.calls[
        index
      ]?.[0] as ProcessorBrowserRequest
      expect(normalized(requestInput)).toEqual(expectedRequests[index])
    }
  })

  it("decodes strict owner wire data and preserves CSRF state transitions", async () => {
    const serialized = {
      status: "authenticated",
      principal: {
        identityId: "00000000-0000-4000-8000-000000000001",
        displayName: "Operator One",
        email: "operator@example.com",
      },
      access: {
        locations: [
          {
            id: "pressly-one",
            name: "Pressly One",
            timezone: "America/New_York",
            capabilities: ["processor:view", "production:read"],
          },
        ],
        applications: [
          {
            id: "processor",
            label: "Pressly Processor",
            description: "Run laundry-floor production.",
            href: "https://processor.trypressly.com/",
          },
        ],
      },
      expiresAt: "2026-08-01T20:00:00.000Z",
      csrfToken: "a".repeat(43),
    } as const
    const request = vi.fn(async (_request, codec) => {
      const decoded = codec.decode(serialized)
      if (decoded.kind === "invalid") throw fault
      return decoded.value
    })
    const acceptCsrfToken = vi.fn()
    const clearCsrfToken = vi.fn()
    const client = makeProcessorAuthenticationBrowserClient({
      operations,
      request,
      acceptCsrfToken,
      clearCsrfToken,
    })

    const session = await client.restore()

    expect(session.expiresAt).toBe(serialized.expiresAt)
    expect(acceptCsrfToken).toHaveBeenCalledExactlyOnceWith(
      serialized.csrfToken
    )

    request.mockImplementationOnce(async (_request, codec) => {
      const decoded = codec.decode({
        status: "mfa_required",
        expiresAt: "2026-08-01T20:05:00.000Z",
      })
      if (decoded.kind === "invalid") throw fault
      return decoded.value
    })
    await client.login({ email: "owner@example.com", password: "password" })
    expect(clearCsrfToken).toHaveBeenCalledOnce()
  })

  it("rejects unknown response fields through the owner wire codec", async () => {
    const request = vi.fn(async (_request, codec) => {
      const decoded = codec.decode({
        revoked: true,
        leaked: "field",
      })
      if (decoded.kind === "invalid") throw fault
      return decoded.value
    })
    const client = makeProcessorAuthenticationBrowserClient({
      operations,
      request,
      acceptCsrfToken: vi.fn(),
      clearCsrfToken: vi.fn(),
    })

    await expect(client.logout()).rejects.toBe(fault)
  })
})
