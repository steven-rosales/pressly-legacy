import { z } from "zod"
import { describe, expect, it, vi } from "vitest"
import { makeControlHttpClient } from "@/api/control-http-client"
import { makeControlInvitationApi } from "@/features/team/invitation-api"

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const acceptance = {
  invitationId: "f24f3d2a-f915-4e79-90be-1f60b9e67127",
  membershipId: "bea6ff17-dfeb-4651-888a-b831eaa825bd",
  identityId: "61f384d8-36b3-49bd-8ef6-319e993d36ce",
  identityCreated: false,
  privilegedAccessEffective: false,
  replayed: false,
}

describe("Control invitation API", () => {
  it("keeps the acceptance credential in the request body and requires account proof", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          status: "mfa_required",
          methods: ["totp", "recovery"],
        },
      }),
    )
    const api = makeControlInvitationApi(
      makeControlHttpClient({ fetchImplementation }),
    )
    const token = "t".repeat(43)

    await expect(
      api.acceptExistingPassword({
        token,
        idempotencyKey: "bootstrap-attempt-1",
        password: "existing-password",
      }),
    ).resolves.toEqual({
      status: "mfa_required",
      methods: ["totp", "recovery"],
    })

    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/control/invitations/accept/existing/password",
      expect.objectContaining({
        method: "POST",
      }),
    )
    expect(fetchImplementation.mock.calls[0]?.[0]).not.toContain(token)
    expect(
      JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body)),
    ).toEqual({
      acceptanceToken: token,
      idempotencyKey: "bootstrap-attempt-1",
      password: "existing-password",
    })
  })

  it("accepts an operator destination without inventing a Control session", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          status: "accepted",
          acceptance,
          session: null,
          destination: {
            id: "processor",
            label: "Pressly Processor",
            description: "Complete floor work.",
            href: "http://localhost:4173/",
          },
        },
      }),
    )
    const client = makeControlHttpClient({ fetchImplementation })
    const api = makeControlInvitationApi(client)

    await expect(
      api.acceptExistingMfa({
        token: "t".repeat(43),
        idempotencyKey: "bootstrap-attempt-2",
        method: "totp",
        code: "123456",
      }),
    ).resolves.toMatchObject({
      status: "accepted",
      session: null,
      destination: { id: "processor" },
    })

    await expect(
      client.request(
        { method: "POST", path: "/protected", csrf: true },
        z.object({ updated: z.literal(true) }),
      ),
    ).rejects.toMatchObject({
      kind: "session_refresh_required",
    })
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
  })

  it("rejects a server-selected destination outside Pressly's allowlist", async () => {
    const api = makeControlInvitationApi(
      makeControlHttpClient({
        fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
          jsonResponse({
            ok: true,
            data: {
              status: "accepted",
              acceptance,
              session: null,
              destination: {
                id: "processor",
                label: "Pressly Processor",
                description: "Complete floor work.",
                href: "https://attacker.example/",
              },
            },
          }),
        ),
      }),
    )

    await expect(
      api.acceptExistingMfa({
        token: "t".repeat(43),
        idempotencyKey: "bootstrap-attempt-3",
        method: "totp",
        code: "123456",
      }),
    ).rejects.toMatchObject({
      kind: "unreadable_response",
    })
  })

  it("preserves stable error identity without exposing server presentation text", async () => {
    const api = makeControlInvitationApi(
      makeControlHttpClient({
        fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
          jsonResponse(
            {
              ok: false,
              error: {
                code: "workforce_invalid_state",
                message: "This workforce action is no longer available.",
                traceId: "trace-control-invitation-replay",
              },
            },
            409,
          ),
        ),
      }),
    )

    await expect(api.preview("t".repeat(43))).rejects.toMatchObject({
      message: "conflict",
      kind: "conflict",
      code: "workforce_invalid_state",
      status: 409,
    })
  })

  it("decodes structured password-policy failures as invalid requests", async () => {
    const api = makeControlInvitationApi(
      makeControlHttpClient({
        fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
          jsonResponse(
            {
              ok: false,
              error: {
                code: "weak_invitation_password",
                message: "Choose a stronger password.",
                traceId: "trace-control-invitation-password",
                details: {
                  violations: [
                    "password_requires_uppercase",
                    "password_requires_number",
                  ],
                },
              },
            },
            422,
          ),
        ),
      }),
    )

    await expect(
      api.acceptNewIdentity({
        token: "t".repeat(43),
        idempotencyKey: "bootstrap-attempt-password-policy",
        password: "long-safe-password",
      }),
    ).rejects.toMatchObject({
      message: "invalid_request",
      kind: "invalid_request",
      code: "weak_invitation_password",
      status: 422,
    })
  })
})
