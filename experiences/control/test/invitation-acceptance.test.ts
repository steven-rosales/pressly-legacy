import { describe, expect, it, vi } from "vitest"
import { makeAcceptExistingPasswordCell } from "../src/cells/invitations/accept-existing-invitation-password/execute.ts"

const identityId = "11111111-1111-4111-8111-111111111111"
const sessionId = "22222222-2222-4222-8222-222222222222"
const businessId = "33333333-3333-4333-8333-333333333333"
const invitationId = "44444444-4444-4444-8444-444444444444"
const membershipId = "55555555-5555-4555-8555-555555555555"
const expiresAt = new Date("2026-08-22T21:00:00.000Z")

const preview = {
  invitationId,
  businessId,
  businessName: "Pressly Laundry",
  emailNormalized: "owner@example.com",
  displayName: "Owner",
  intendedRole: "owner" as const,
  intendedLocationId: null,
  expiresAt,
  existingIdentity: true,
}
const loaded = {
  principal: {
    identityId,
    kind: "human" as const,
    displayName: "Owner",
    email: "owner@example.com",
    sessionId,
    sessionIssuedAt: new Date("2026-08-22T20:00:00.000Z"),
    sessionExpiresAt: expiresAt,
  },
  principalAttributes: {
    assignments: [],
    identityActive: true,
    assuranceLevel: "mfa" as const,
  },
}
const accepted = {
  invitation: {
    id: invitationId,
    businessId,
    emailNormalized: "owner@example.com",
    displayName: "Owner",
    intendedRole: "owner" as const,
    intendedLocationId: null,
    state: "accepted" as const,
    version: 2,
    expiresAt,
    createdAt: new Date("2026-08-22T19:00:00.000Z"),
  },
  identityId,
  membershipId,
  identityCreated: false,
  privilegedAccessEffective: true,
  replayed: false,
}
const access = {
  business: { id: businessId, name: "Pressly Laundry" },
  locations: [],
  selectedLocationId: null,
  capabilities: [
    "control:view" as const,
    "team:read" as const,
    "processor:view" as const,
  ],
  applications: [
    {
      id: "control" as const,
      label: "Pressly Control",
      description: "Manage people, customers, orders, and account security.",
      href: "https://control.pressly.test",
    },
  ],
}
const input = {
  acceptanceToken: "t".repeat(40),
  idempotencyKey: "acceptance-key",
  password: "correct-horse-battery-staple",
}

describe("Control invitation credential bootstrap", () => {
  it("preserves preview, login, load, accept, access and cookie ordering", async () => {
    const events: string[] = []
    const cookieMutations: unknown[] = []
    const cell = makeAcceptExistingPasswordCell({
      previewInvitation: {
        execute: async () => {
          events.push("preview")
          return { kind: "success", value: preview }
        },
      },
      login: {
        execute: async () => {
          events.push("login")
          return {
            kind: "success",
            value: {
              accessToken: "session-token",
              expiresAt,
              principal: {
                identityId,
                displayName: "Owner",
                email: "owner@example.com",
                roles: ["owner"],
              },
            },
          }
        },
      },
      loadSession: {
        execute: async () => {
          events.push("load")
          return { kind: "success", value: loaded }
        },
      },
      acceptInvitation: {
        execute: async () => {
          events.push("accept")
          return { kind: "success", value: accepted }
        },
      },
      resolveAccess: async () => {
        events.push("resolve")
        return access
      },
      revokeSession: {
        execute: async () => ({
          kind: "success",
          value: { revoked: true as const },
        }),
      },
      presentation: {
        deriveCsrfToken: () => "a".repeat(43),
        serializeCookies: (mutations) => {
          events.push("cookies")
          cookieMutations.push(...mutations)
          return mutations.map(
            (mutation) => `${mutation.action}:${mutation.cookie}`,
          )
        },
      },
      controlOrigin: "https://control.pressly.test",
      processorOrigin: "https://processor.pressly.test",
    })

    await expect(cell.execute(input)).resolves.toMatchObject({
      kind: "success",
      value: {
        data: {
          status: "accepted",
          acceptance: { invitationId, identityId, membershipId },
          session: { status: "authenticated" },
          destination: { id: "control" },
        },
        setCookieHeaders: ["set:session", "clear:mfa"],
      },
    })
    expect(events).toEqual([
      "preview",
      "login",
      "load",
      "accept",
      "resolve",
      "cookies",
    ])
    expect(cookieMutations).toEqual([
      {
        action: "set",
        cookie: "session",
        value: "session-token",
        expiresAt,
      },
      { action: "clear", cookie: "mfa" },
    ])
  })

  it("revokes the bootstrap session and returns observable cookie-clearing failure data", async () => {
    const events: string[] = []
    const resolveAccess = vi.fn(async () => access)
    const cell = makeAcceptExistingPasswordCell({
      previewInvitation: {
        execute: async () => ({ kind: "success", value: preview }),
      },
      login: {
        execute: async () => ({
          kind: "success",
          value: {
            accessToken: "session-token",
            expiresAt,
            principal: {
              identityId,
              displayName: "Owner",
              email: "owner@example.com",
              roles: ["owner"],
            },
          },
        }),
      },
      loadSession: {
        execute: async () => ({ kind: "success", value: loaded }),
      },
      acceptInvitation: {
        execute: async () => ({
          kind: "failure",
          failure: {
            kind: "not_found" as const,
            code: "workforce_invitation_not_found",
            message: "This workforce record is not available.",
          },
        }),
      },
      resolveAccess,
      revokeSession: {
        execute: async () => {
          events.push("revoke")
          return { kind: "success", value: { revoked: true as const } }
        },
      },
      presentation: {
        deriveCsrfToken: () => "a".repeat(43),
        serializeCookies: (mutations) => {
          events.push("cookies")
          return mutations.map(
            (mutation) => `${mutation.action}:${mutation.cookie}`,
          )
        },
      },
      controlOrigin: "https://control.pressly.test",
      processorOrigin: "https://processor.pressly.test",
    })

    await expect(cell.execute(input)).resolves.toEqual({
      kind: "failure",
      failure: {
        kind: "not_found",
        code: "workforce_invitation_not_found",
        message:
          "Control peer rejected the request: workforce_invitation_not_found.",
        safeMessage: "This workforce record is not available.",
        setCookieHeaders: ["clear:session"],
      },
    })
    expect(events).toEqual(["revoke", "cookies"])
    expect(resolveAccess).not.toHaveBeenCalled()
  })
})
