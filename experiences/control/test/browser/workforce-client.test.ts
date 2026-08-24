import { unexpectedError } from "@pressly/errors/factories"
import { describe, expect, it, vi } from "vitest"
import {
  makeControlWorkforceBrowserClient,
  type ControlBrowserRequest,
} from "../../src/browser.ts"
import { controlWorkforceOperations } from "./operations.fixture.ts"

const fault = unexpectedError({
  code: "control_browser_workforce_fault_fixture",
  message: "Control browser workforce fault fixture.",
})

describe("Control workforce browser client", () => {
  it("emits all thirteen selected request vectors and preserves failures", async () => {
    const key = "00000000-0000-4000-8000-000000000001"
    const request = vi.fn().mockRejectedValue(fault)
    const client = makeControlWorkforceBrowserClient({
      operations: controlWorkforceOperations,
      request,
      idempotencyKey: () => key,
    })
    const invitation = { id: "invitation/one", version: 2 }
    const calls = [
      () => client.listMembers(),
      () => client.getMember("membership/one"),
      () => client.listMemberSessions("membership/one"),
      () =>
        client.revokeMemberSessions({
          membershipId: "membership/one",
          sessionId: "session/one",
        }),
      () => client.listInvitations(),
      () =>
        client.issueInvitation({
          email: "operator@example.com",
          displayName: "Operator One",
          intendedRole: "operator",
          intendedLocationId: "location/one",
        }),
      () => client.reissueInvitation(invitation),
      () => client.revokeInvitation(invitation),
      () =>
        client.transitionMember({
          action: "suspend",
          membershipId: "membership/one",
          expectedVersion: 2,
          reason: "Security review.",
        }),
      () =>
        client.transitionMember({
          action: "reactivate",
          membershipId: "membership/one",
          expectedVersion: 3,
        }),
      () =>
        client.transitionMember({
          action: "end",
          membershipId: "membership/one",
          expectedVersion: 4,
        }),
      () =>
        client.grantAccess({
          membershipId: "membership/one",
          identityId: "identity/one",
          role: "operator",
          scope: { kind: "location", id: "location/one" },
        }),
      () =>
        client.revokeAccess({
          grantId: "grant/one",
          expectedVersion: 5,
          reason: "No longer needed.",
        }),
    ]

    for (const call of calls) await expect(call()).rejects.toBe(fault)

    expect(
      request.mock.calls.map((call) => {
        const input = call[0] as ControlBrowserRequest
        return {
          method: input.method,
          path: input.path,
          ...(input.csrf === true ? { csrf: true } : {}),
        }
      }),
    ).toEqual([
      { method: "GET", path: "/control/team?limit=100" },
      { method: "GET", path: "/control/team/membership%2Fone" },
      {
        method: "GET",
        path: "/control/team/membership%2Fone/sessions",
      },
      {
        method: "POST",
        path: "/control/team/membership%2Fone/sessions/revoke",
        csrf: true,
      },
      { method: "GET", path: "/control/invitations?limit=100" },
      { method: "POST", path: "/control/invitations", csrf: true },
      {
        method: "POST",
        path: "/control/invitations/invitation%2Fone/reissue",
        csrf: true,
      },
      {
        method: "POST",
        path: "/control/invitations/invitation%2Fone/revoke",
        csrf: true,
      },
      {
        method: "POST",
        path: "/control/team/membership%2Fone/suspend",
        csrf: true,
      },
      {
        method: "POST",
        path: "/control/team/membership%2Fone/reactivate",
        csrf: true,
      },
      {
        method: "POST",
        path: "/control/team/membership%2Fone/end",
        csrf: true,
      },
      {
        method: "POST",
        path: "/control/team/membership%2Fone/grants",
        csrf: true,
      },
      {
        method: "POST",
        path: "/control/grants/grant%2Fone/revoke",
        csrf: true,
      },
    ])
    for (const index of [3, 5, 6, 7, 8, 9, 10, 11, 12])
      expect(request.mock.calls[index]?.[0]).toMatchObject({
        body: expect.any(Object),
      })
    expect(request.mock.calls[3]?.[0]).toMatchObject({
      body: { idempotencyKey: key, sessionId: "session/one" },
    })
    expect(request.mock.calls[11]?.[0]).toMatchObject({
      body: {
        idempotencyKey: key,
        identityId: "identity/one",
        role: "operator",
        scope: { kind: "location", id: "location/one" },
      },
    })
  })

  it("returns strict serialized member pages without Date conversion", async () => {
    const serialized = {
      members: [
        {
          membershipId: "00000000-0000-4000-8000-000000000001",
          businessId: "00000000-0000-4000-8000-000000000002",
          identityId: "00000000-0000-4000-8000-000000000003",
          displayName: "Operator One",
          email: "operator@example.com",
          state: "active",
          version: 1,
          mfaEnabled: true,
          grants: [],
          startedAt: "2026-08-20T12:00:00.000Z",
          suspendedAt: null,
          endedAt: null,
        },
      ],
      nextCursor: null,
    } as const
    const request = vi.fn(async (_request, codec) => {
      const decoded = codec.decode(serialized)
      if (decoded.kind === "invalid") throw fault
      return decoded.value
    })
    const client = makeControlWorkforceBrowserClient({
      operations: controlWorkforceOperations,
      request,
      idempotencyKey: () => "unused-key",
    })

    const result = await client.listMembers()

    expect(result).toEqual(serialized)
    expect(result.members[0]?.startedAt).toBe(serialized.members[0].startedAt)
  })
})
