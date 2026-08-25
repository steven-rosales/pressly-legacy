import { unexpectedError } from "@pressly/errors/factories"
import { describe, expect, it, vi } from "vitest"
import {
  makeControlInvitationsBrowserClient,
  type ControlBrowserRequest,
} from "../../src/browser.ts"
import { controlInvitationOperations } from "./operations.fixture.ts"

const fault = unexpectedError({
  code: "control_browser_invitations_fault_fixture",
  message: "Control browser invitations fault fixture.",
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

describe("Control invitation browser client", () => {
  it("matches the four live request vectors and preserves failures", async () => {
    const request = vi.fn().mockRejectedValue(fault)
    const client = makeControlInvitationsBrowserClient({
      operations: controlInvitationOperations,
      request: request,
      acceptCsrfToken: vi.fn(),
    })
    const calls = [
      () => client.preview("acceptance-token"),
      () =>
        client.acceptNewIdentity({
          token: "acceptance-token",
          idempotencyKey: "invitation-command-1",
          password: "correct horse battery staple",
        }),
      () =>
        client.acceptExistingPassword({
          token: "acceptance-token",
          idempotencyKey: "invitation-command-2",
          password: "correct horse battery staple",
        }),
      () =>
        client.acceptExistingMfa({
          token: "acceptance-token",
          idempotencyKey: "invitation-command-3",
          method: "totp",
          code: "123456",
        }),
    ]
    const expectedRequests = [
      {
        method: "POST",
        path: "/control/invitations/preview",
        body: { acceptanceToken: "acceptance-token" },
      },
      {
        method: "POST",
        path: "/control/invitations/accept/new",
        body: {
          identityMode: "new_identity",
          idempotencyKey: "invitation-command-1",
          acceptanceToken: "acceptance-token",
          password: "correct horse battery staple",
        },
      },
      {
        method: "POST",
        path: "/control/invitations/accept/existing/password",
        body: {
          acceptanceToken: "acceptance-token",
          idempotencyKey: "invitation-command-2",
          password: "correct horse battery staple",
        },
      },
      {
        method: "POST",
        path: "/control/invitations/accept/existing/mfa",
        body: {
          acceptanceToken: "acceptance-token",
          idempotencyKey: "invitation-command-3",
          method: "totp",
          code: "123456",
        },
      },
    ]

    for (const call of calls) await expect(call()).rejects.toBe(fault)
    for (let index = 0; index < calls.length; index += 1)
      expect(
        normalized(request.mock.calls[index]?.[0] as ControlBrowserRequest),
      ).toEqual(expectedRequests[index])
  })

  it("renders the one target-only existing-session acceptance route", async () => {
    const request = vi.fn().mockRejectedValue(fault)
    const client = makeControlInvitationsBrowserClient({
      operations: controlInvitationOperations,
      request,
      acceptCsrfToken: vi.fn(),
    })

    await expect(
      client.acceptExisting({
        token: "acceptance-token",
        idempotencyKey: "invitation-command-4",
      }),
    ).rejects.toBe(fault)
    expect(request.mock.calls[0]?.[0]).toEqual({
      method: "POST",
      path: "/control/invitations/accept/existing",
      body: {
        identityMode: "existing_identity",
        idempotencyKey: "invitation-command-4",
        acceptanceToken: "acceptance-token",
      },
      csrf: true,
    })
  })

  it("matches strict bootstrap wire values and rejects an untrusted destination", async () => {
    const serialized = {
      status: "accepted",
      acceptance: {
        invitationId: "00000000-0000-4000-8000-000000000001",
        membershipId: "00000000-0000-4000-8000-000000000002",
        identityId: "00000000-0000-4000-8000-000000000003",
        identityCreated: false,
        privilegedAccessEffective: true,
        replayed: false,
      },
      session: null,
      destination: {
        id: "control",
        label: "Pressly Control",
        description: "Manage Pressly.",
        href: "https://control.trypressly.com/",
      },
    } as const
    const request = vi.fn(async (_request, codec) => {
      const decoded = codec.decode(serialized)
      if (decoded.kind === "invalid") throw fault
      return decoded.value
    })
    const client = makeControlInvitationsBrowserClient({
      operations: controlInvitationOperations,
      request: request,
      acceptCsrfToken: vi.fn(),
    })
    const call = {
      token: "acceptance-token".repeat(3),
      idempotencyKey: "invitation-command-5",
      password: "correct horse battery staple",
    }

    const result = await client.acceptExistingPassword(call)
    expect(result).toEqual(serialized)

    request.mockImplementationOnce(async (_request, codec) => {
      const decoded = codec.decode({
        ...serialized,
        destination: {
          ...serialized.destination,
          href: "https://attacker.example/",
        },
      })
      if (decoded.kind === "invalid") throw fault
      return decoded.value
    })
    await expect(client.acceptExistingPassword(call)).rejects.toBe(fault)
  })
})
