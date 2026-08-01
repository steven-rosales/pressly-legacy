import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ControlApiError } from "@/api/control-http-client"
import { TeamWorkspace } from "@/features/team/team-workspace"
import type { ControlTeamApi } from "@/features/team/team-api"
import type { ControlAuthenticatedSession } from "@/authentication/control-session"

const session = (
  capabilities: ControlAuthenticatedSession["access"]["capabilities"],
): ControlAuthenticatedSession => ({
  status: "authenticated",
  principal: {
    identityId: "8a283721-7ff9-4d18-a497-e3a0dca576b7",
    displayName: "Olivia Press",
  },
  access: {
    business: {
      id: "404d5ca3-72cb-4ed8-8fbf-95b6a371a9a6",
      name: "Pressly One",
    },
    locations: [
      {
        id: "laundry-production",
        name: "Laundry Production",
        timezone: "America/New_York",
      },
    ],
    selectedLocationId: "laundry-production",
    capabilities,
    applications: [],
  },
  expiresAt: "2026-08-01T12:00:00.000Z",
  csrfToken: "c".repeat(43),
})

const makeApi = (overrides: Partial<ControlTeamApi> = {}): ControlTeamApi => ({
  listMembers: vi.fn().mockResolvedValue({
    members: [],
    nextCursor: null,
  }),
  getMember: vi.fn(),
  listMemberSessions: vi.fn().mockResolvedValue({
    sessions: [],
  }),
  revokeMemberSessions: vi.fn(),
  listInvitations: vi.fn().mockResolvedValue({
    invitations: [],
    nextCursor: null,
  }),
  issueInvitation: vi.fn(),
  reissueInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  transitionMember: vi.fn(),
  grantAccess: vi.fn(),
  revokeAccess: vi.fn(),
  ...overrides,
})

describe("Team workspace", () => {
  it("renders an honest empty state and hides mutations without team:write", async () => {
    render(<TeamWorkspace api={makeApi()} session={session(["team:read"])} />)

    expect(await screen.findByText("No team members found")).toBeVisible()
    expect(screen.getByText("Read-only team access")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Invite teammate" }),
    ).not.toBeInTheDocument()
  })

  it("issues an operator invitation and displays its link only in component memory", async () => {
    const token = "t".repeat(43)
    const issueInvitation = vi.fn().mockResolvedValue({
      status: "issued",
      acceptanceToken: token,
      invitation: {
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
      },
    })
    const user = userEvent.setup()
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    render(
      <TeamWorkspace
        api={makeApi({ issueInvitation })}
        session={session(["team:read", "team:write"])}
      />,
    )

    await screen.findByText("No team members found")
    await user.click(screen.getByRole("button", { name: "Invite teammate" }))
    await user.type(screen.getByLabelText("Employee name"), "Opal Operator")
    await user.type(screen.getByLabelText("Email"), "operator@example.com")
    await user.click(
      screen.getByRole("button", { name: "Create invitation link" }),
    )

    await waitFor(() =>
      expect(issueInvitation).toHaveBeenCalledWith({
        displayName: "Opal Operator",
        email: "operator@example.com",
        intendedRole: "operator",
        intendedLocationId: "laundry-production",
      }),
    )
    const link = await screen.findByLabelText("Invitation link")
    expect(link).toHaveValue(`http://localhost:3000/#invite=${token}`)
    expect(setItem).not.toHaveBeenCalled()
  })

  it("keeps the current team table available during member review", async () => {
    const listMembers = vi.fn().mockResolvedValue({
      members: [
        {
          membershipId: "bea6ff17-dfeb-4651-888a-b831eaa825bd",
          businessId: "404d5ca3-72cb-4ed8-8fbf-95b6a371a9a6",
          identityId: "61f384d8-36b3-49bd-8ef6-319e993d36ce",
          displayName: "Opal Operator",
          email: "operator@example.com",
          state: "active",
          version: 1,
          mfaEnabled: false,
          grants: [],
          startedAt: "2026-07-30T12:00:00.000Z",
          suspendedAt: null,
          endedAt: null,
        },
      ],
      nextCursor: null,
    })
    render(
      <TeamWorkspace
        api={makeApi({ listMembers })}
        session={session(["team:read"])}
      />,
    )

    expect(await screen.findAllByText("Opal Operator")).toHaveLength(2)
    expect(
      screen.getAllByRole("button", {
        name: "Review Opal Operator",
      })[0],
    ).toBeEnabled()
  })

  it("keeps a replayed invitation inside the deliberate invite flow", async () => {
    const issueInvitation = vi.fn().mockResolvedValue({
      status: "replayed",
      invitation: {
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
      },
    })
    const user = userEvent.setup()
    render(
      <TeamWorkspace
        api={makeApi({ issueInvitation })}
        session={session(["team:read", "team:write"])}
      />,
    )

    await screen.findByText("No team members found")
    await user.click(screen.getByRole("button", { name: "Invite teammate" }))
    await user.type(screen.getByLabelText("Employee name"), "Opal Operator")
    await user.type(screen.getByLabelText("Email"), "operator@example.com")
    await user.click(
      screen.getByRole("button", { name: "Create invitation link" }),
    )

    expect(
      await screen.findByText(
        "This exact request was already processed. Replace the existing link if the employee needs a new one.",
      ),
    ).toBeVisible()
    expect(screen.queryByLabelText("Invitation link")).not.toBeInTheDocument()
  })

  it("confirms replacing a pending invitation in a modal", async () => {
    const invitation = {
      id: "f24f3d2a-f915-4e79-90be-1f60b9e67127",
      businessId: "404d5ca3-72cb-4ed8-8fbf-95b6a371a9a6",
      email: "operator@example.com",
      displayName: "Opal Operator",
      intendedRole: "operator" as const,
      intendedLocationId: "laundry-production",
      state: "pending" as const,
      version: 1,
      expiresAt: "2026-08-01T12:00:00.000Z",
      createdAt: "2026-07-30T12:00:00.000Z",
    }
    const reissueInvitation = vi.fn().mockResolvedValue({
      status: "issued",
      acceptanceToken: "t".repeat(43),
      invitation,
    })
    const user = userEvent.setup()
    render(
      <TeamWorkspace
        api={makeApi({
          listInvitations: vi.fn().mockResolvedValue({
            invitations: [invitation],
            nextCursor: null,
          }),
          reissueInvitation,
        })}
        session={session(["team:read", "team:write"])}
      />,
    )

    await user.click(
      (
        await screen.findAllByRole("button", {
          name: "Actions for Opal Operator",
        })
      )[0]!,
    )
    await user.click(
      screen.getByRole("menuitem", { name: "Replace invitation link" }),
    )
    expect(screen.getByRole("alertdialog")).toBeVisible()
    expect(
      screen.getByText("Replace Opal Operator's invitation link?"),
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Confirm" }))

    await waitFor(() =>
      expect(reissueInvitation).toHaveBeenCalledWith(invitation),
    )
  })

  it("surfaces a stale membership conflict without closing the review", async () => {
    const member = {
      membershipId: "bea6ff17-dfeb-4651-888a-b831eaa825bd",
      businessId: "404d5ca3-72cb-4ed8-8fbf-95b6a371a9a6",
      identityId: "61f384d8-36b3-49bd-8ef6-319e993d36ce",
      displayName: "Opal Operator",
      email: "operator@example.com",
      state: "active" as const,
      version: 1,
      mfaEnabled: false,
      grants: [],
      startedAt: "2026-07-30T12:00:00.000Z",
      suspendedAt: null,
      endedAt: null,
    }
    const transitionMember = vi
      .fn()
      .mockRejectedValue(new ControlApiError(409, "conflict"))
    const api = makeApi({
      listMembers: vi.fn().mockResolvedValue({
        members: [member],
        nextCursor: null,
      }),
      getMember: vi.fn().mockResolvedValue({
        ...member,
        activeSessionCount: 0,
        createdAt: "2026-07-30T12:00:00.000Z",
        updatedAt: "2026-07-30T13:00:00.000Z",
      }),
      transitionMember,
    })
    const user = userEvent.setup()
    render(
      <TeamWorkspace
        api={api}
        session={session(["team:read", "team:write"])}
      />,
    )

    await user.click(
      (
        await screen.findAllByRole("button", {
          name: "Review Opal Operator",
        })
      )[0]!,
    )
    await user.click(
      await screen.findByRole("button", {
        name: "Suspend access for Opal Operator",
      }),
    )
    expect(screen.getByRole("alertdialog")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Confirm" }))

    expect(
      await screen.findByText(
        "This record changed while you were working. Refresh and review the latest access before trying again.",
      ),
    ).toBeVisible()
    expect(screen.getAllByText("Opal Operator")).toHaveLength(3)
  })

  it("reviews and deliberately revokes a team member browser session", async () => {
    const member = {
      membershipId: "bea6ff17-dfeb-4651-888a-b831eaa825bd",
      businessId: "404d5ca3-72cb-4ed8-8fbf-95b6a371a9a6",
      identityId: "61f384d8-36b3-49bd-8ef6-319e993d36ce",
      displayName: "Opal Operator",
      email: "operator@example.com",
      state: "active" as const,
      version: 1,
      mfaEnabled: false,
      grants: [],
      startedAt: "2026-07-30T12:00:00.000Z",
      suspendedAt: null,
      endedAt: null,
    }
    const workforceSession = {
      id: "f24f3d2a-f915-4e79-90be-1f60b9e67127",
      issuedAt: "2026-07-30T12:00:00.000Z",
      lastUsedAt: "2026-07-30T13:00:00.000Z",
      expiresAt: "2099-08-01T12:00:00.000Z",
      revokedAt: null,
      current: false,
    }
    const revokeMemberSessions = vi
      .fn()
      .mockResolvedValue({ revokedCount: 1, replayed: false })
    const api = makeApi({
      listMembers: vi.fn().mockResolvedValue({
        members: [member],
        nextCursor: null,
      }),
      getMember: vi.fn().mockResolvedValue({
        ...member,
        activeSessionCount: 1,
        createdAt: "2026-07-30T12:00:00.000Z",
        updatedAt: "2026-07-30T13:00:00.000Z",
      }),
      listMemberSessions: vi.fn().mockResolvedValue({
        sessions: [workforceSession],
      }),
      revokeMemberSessions,
    })
    const user = userEvent.setup()
    render(
      <TeamWorkspace
        api={api}
        session={session(["team:read", "team:write"])}
      />,
    )

    await user.click(
      (
        await screen.findAllByRole("button", {
          name: "Review Opal Operator",
        })
      )[0]!,
    )
    expect(await screen.findByText("Browser sessions")).toBeVisible()
    await user.click(
      screen.getAllByRole("button", {
        name: /^Sign out Signed in/,
      })[0]!,
    )
    expect(screen.getByRole("alertdialog")).toBeVisible()
    expect(screen.getByText("Sign this browser out?")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Confirm sign out" }))

    await waitFor(() =>
      expect(revokeMemberSessions).toHaveBeenCalledWith({
        membershipId: member.membershipId,
        sessionId: workforceSession.id,
      }),
    )
  })
})
