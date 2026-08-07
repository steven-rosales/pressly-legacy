import { describe, expect, it, vi } from "vitest"
import { makeControlHttpClient } from "@/api/control-http-client"
import { makeControlTeamApi } from "@/features/team/team-api"

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const invitation = {
  id: "f24f3d2a-f915-4e79-90be-1f60b9e67127",
  businessId: "404d5ca3-72cb-4ed8-8fbf-95b6a371a9a6",
  email: "operator@example.com",
  displayName: "Opal Operator",
  intendedRole: "operator",
  intendedLocationId: "laundry-production",
  state: "pending",
  version: 1,
  expiresAt: "2026-08-01T12:00:00.000Z",
  createdAt: "2026-07-30T12:00:00.000Z",
}

describe("Control team API", () => {
  it("keeps mutation CSRF proof in memory and validates one-time issue results", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          status: "issued",
          invitation,
          acceptanceToken: "t".repeat(43),
        },
      }),
    )
    const client = makeControlHttpClient({ fetchImplementation })
    client.acceptCsrfToken("c".repeat(43))
    const api = makeControlTeamApi(client)

    await expect(
      api.issueInvitation({
        email: invitation.email,
        displayName: invitation.displayName,
        intendedRole: "operator",
        intendedLocationId: "laundry-production",
      }),
    ).resolves.toMatchObject({
      status: "issued",
      acceptanceToken: "t".repeat(43),
    })

    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/control/invitations",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.objectContaining({
          "X-CSRF-Token": "c".repeat(43),
        }),
      }),
    )
    const request = fetchImplementation.mock.calls[0]?.[1]
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      email: invitation.email,
      intendedRole: "operator",
    })
    expect(body["idempotencyKey"]).toEqual(expect.any(String))
  })

  it("rejects a malformed result instead of exposing an unvalidated token", async () => {
    const client = makeControlHttpClient({
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({
          ok: true,
          data: {
            status: "issued",
            invitation,
            acceptanceToken: "short",
          },
        }),
      ),
    })
    client.acceptCsrfToken("c".repeat(43))

    await expect(
      makeControlTeamApi(client).issueInvitation({
        email: invitation.email,
        displayName: invitation.displayName,
        intendedRole: "operator",
        intendedLocationId: "laundry-production",
      }),
    ).rejects.toMatchObject({
      controlKind: "unreadable_response",
    })
  })

  it("revokes only the selected workforce session with CSRF and idempotency proof", async () => {
    const membershipId = "bea6ff17-dfeb-4651-888a-b831eaa825bd"
    const sessionId = "61f384d8-36b3-49bd-8ef6-319e993d36ce"
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        data: { revokedCount: 1, replayed: false },
      }),
    )
    const client = makeControlHttpClient({ fetchImplementation })
    client.acceptCsrfToken("c".repeat(43))

    await expect(
      makeControlTeamApi(client).revokeMemberSessions({
        membershipId,
        sessionId,
      }),
    ).resolves.toEqual({ revokedCount: 1, replayed: false })

    expect(fetchImplementation).toHaveBeenCalledWith(
      `/api/control/team/${membershipId}/sessions/revoke`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-CSRF-Token": "c".repeat(43),
        }),
      }),
    )
    const body = JSON.parse(
      String(fetchImplementation.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>
    expect(body).toEqual({
      idempotencyKey: expect.any(String),
      sessionId,
    })
  })
})
