import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { InvitationAcceptanceView } from "@/features/team/invitation-acceptance-view"
import type { ControlInvitationApi } from "@/features/team/invitation-api"

const preview = {
  invitationId: "f24f3d2a-f915-4e79-90be-1f60b9e67127",
  business: {
    id: "404d5ca3-72cb-4ed8-8fbf-95b6a371a9a6",
    name: "Pressly One",
  },
  email: "manager@example.com",
  displayName: "Maya Manager",
  intendedRole: "manager" as const,
  intendedLocationId: null,
  expiresAt: "2026-08-01T12:00:00.000Z",
  existingIdentity: false,
}

describe("Invitation acceptance", () => {
  it("creates a personal account without persisting the invitation or password", async () => {
    const api: ControlInvitationApi = {
      preview: vi.fn().mockResolvedValue(preview),
      acceptNewIdentity: vi.fn().mockResolvedValue({
        invitationId: preview.invitationId,
        membershipId: "bea6ff17-dfeb-4651-888a-b831eaa825bd",
        identityId: "61f384d8-36b3-49bd-8ef6-319e993d36ce",
        identityCreated: true,
        privilegedAccessEffective: false,
        replayed: false,
      }),
      acceptExistingPassword: vi.fn(),
      acceptExistingMfa: vi.fn(),
    }
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    const user = userEvent.setup()
    render(
      <InvitationAcceptanceView
        api={api}
        token={"t".repeat(43)}
        onContinueToSignIn={vi.fn()}
      />,
    )

    expect(await screen.findByText("Welcome, Maya Manager")).toBeVisible()
    await user.type(screen.getByLabelText("Password"), "CorrectHorse1!Battery")
    await user.type(
      screen.getByLabelText("Confirm password"),
      "CorrectHorse1!Battery",
    )
    await user.click(screen.getByRole("button", { name: "Accept invitation" }))

    await waitFor(() =>
      expect(api.acceptNewIdentity).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "t".repeat(43),
          idempotencyKey: expect.any(String),
          password: "CorrectHorse1!Battery",
        }),
      ),
    )
    expect(
      await screen.findByText("Your Pressly account is ready"),
    ).toBeVisible()
    expect(
      screen.queryByDisplayValue("CorrectHorse1!Battery"),
    ).not.toBeInTheDocument()
    expect(setItem).not.toHaveBeenCalled()
  })

  it("rejects a lowercase-only invitation password before API submission", async () => {
    const acceptNewIdentity = vi.fn()
    const api: ControlInvitationApi = {
      preview: vi.fn().mockResolvedValue(preview),
      acceptNewIdentity,
      acceptExistingPassword: vi.fn(),
      acceptExistingMfa: vi.fn(),
    }
    const user = userEvent.setup()
    render(
      <InvitationAcceptanceView
        api={api}
        token={"t".repeat(43)}
        onContinueToSignIn={vi.fn()}
      />,
    )

    await screen.findByText("Welcome, Maya Manager")
    await user.type(screen.getByLabelText("Password"), "long-safe-password")
    await user.type(
      screen.getByLabelText("Confirm password"),
      "long-safe-password",
    )

    expect(
      screen.getByText(
        "Use 16 or more characters with uppercase and lowercase letters, a number, and a symbol.",
      ),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Accept invitation" }),
    ).toBeDisabled()
    expect(acceptNewIdentity).not.toHaveBeenCalled()
  })

  it("optionally reveals and hides both new-account password fields", async () => {
    const api: ControlInvitationApi = {
      preview: vi.fn().mockResolvedValue(preview),
      acceptNewIdentity: vi.fn(),
      acceptExistingPassword: vi.fn(),
      acceptExistingMfa: vi.fn(),
    }
    const user = userEvent.setup()
    render(
      <InvitationAcceptanceView
        api={api}
        token={"t".repeat(43)}
        onContinueToSignIn={vi.fn()}
      />,
    )

    await screen.findByText("Welcome, Maya Manager")
    const password = screen.getByLabelText("Password")
    const confirmation = screen.getByLabelText("Confirm password")

    expect(password).toHaveAttribute("type", "password")
    expect(confirmation).toHaveAttribute("type", "password")

    await user.click(screen.getByRole("button", { name: "Show passwords" }))

    expect(password).toHaveAttribute("type", "text")
    expect(confirmation).toHaveAttribute("type", "text")
    expect(screen.getByRole("button", { name: "Hide passwords" })).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Hide passwords" }))

    expect(password).toHaveAttribute("type", "password")
    expect(confirmation).toHaveAttribute("type", "password")
    expect(screen.getByRole("button", { name: "Show passwords" })).toBeVisible()
  })

  it("requires the existing account password and MFA before granting access", async () => {
    const acceptExistingPassword = vi.fn().mockResolvedValue({
      status: "mfa_required",
      methods: ["totp", "recovery"],
    })
    const acceptExistingMfa = vi.fn().mockResolvedValue({
      status: "accepted",
      acceptance: {
        invitationId: preview.invitationId,
        membershipId: "bea6ff17-dfeb-4651-888a-b831eaa825bd",
        identityId: "61f384d8-36b3-49bd-8ef6-319e993d36ce",
        identityCreated: false,
        privilegedAccessEffective: true,
        replayed: false,
      },
      session: {
        status: "authenticated",
        principal: {
          identityId: "61f384d8-36b3-49bd-8ef6-319e993d36ce",
          displayName: "Maya Manager",
        },
        access: {
          business: preview.business,
          locations: [],
          selectedLocationId: null,
          capabilities: ["control:view"],
          applications: [],
        },
        expiresAt: "2026-08-01T12:00:00.000Z",
        csrfToken: "c".repeat(43),
      },
      destination: {
        id: "control",
        label: "Pressly Control",
        description: "Manage the business.",
        href: "http://localhost:4174/",
      },
    })
    const api: ControlInvitationApi = {
      preview: vi.fn().mockResolvedValue({
        ...preview,
        existingIdentity: true,
      }),
      acceptNewIdentity: vi.fn(),
      acceptExistingPassword,
      acceptExistingMfa,
    }
    const user = userEvent.setup()
    render(
      <InvitationAcceptanceView
        api={api}
        token={"t".repeat(43)}
        onContinueToSignIn={vi.fn()}
      />,
    )

    await screen.findByText("Join Pressly One")
    await user.type(screen.getByLabelText("Password"), "existing-password")
    await user.click(screen.getByRole("button", { name: "Confirm account" }))
    expect(
      await screen.findByText("Complete account verification"),
    ).toBeVisible()
    await user.type(screen.getByLabelText("Six-digit code"), "123456")
    await user.click(screen.getByRole("button", { name: "Verify and join" }))

    expect(
      await screen.findByText("Your Pressly account is ready"),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Open Pressly Control" }),
    ).toBeVisible()
    expect(acceptExistingPassword).toHaveBeenCalledWith({
      token: "t".repeat(43),
      idempotencyKey: expect.any(String),
      password: "existing-password",
    })
    expect(acceptExistingMfa).toHaveBeenCalledWith({
      token: "t".repeat(43),
      idempotencyKey: expect.any(String),
      method: "totp",
      code: "123456",
    })
    expect(api.acceptNewIdentity).not.toHaveBeenCalled()
  })
})
