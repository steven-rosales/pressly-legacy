import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import i18next from "i18next"
import { describe, expect, it, vi } from "vitest"
import { SecurityWorkspace } from "@/features/security/security-workspace"
import type { ControlSecurityApi } from "@/features/security/security-api"
import type { ControlAuthenticatedSession } from "@/authentication/control-session"

const session: ControlAuthenticatedSession = {
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
    locations: [],
    selectedLocationId: null,
    capabilities: ["security:read", "auth:mfa:enroll"],
    applications: [],
  },
  expiresAt: "2026-08-01T12:00:00.000Z",
  csrfToken: "c".repeat(43),
}

describe("Security workspace", () => {
  it("enrolls MFA and keeps secrets out of browser storage", async () => {
    const api: ControlSecurityApi = {
      beginMfaEnrollment: vi.fn().mockResolvedValue({
        secret: "ABCDEFGHIJKLMNOP",
        enrollmentUri:
          "otpauth://totp/Pressly%3AOlivia?secret=ABCDEFGHIJKLMNOP&issuer=Pressly",
      }),
      confirmMfaEnrollment: vi
        .fn()
        .mockResolvedValue(["recovery-one", "recovery-two"]),
      regenerateRecoveryCodes: vi.fn(),
      removeMfa: vi.fn(),
      listSecurityEvents: vi.fn().mockResolvedValue({
        events: [],
        nextCursor: null,
      }),
    }
    const refresh = vi.fn().mockResolvedValue(undefined)
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    const user = userEvent.setup()
    render(
      <SecurityWorkspace
        api={api}
        session={session}
        onSessionRefresh={refresh}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Set up MFA" }))
    await user.click(screen.getByRole("button", { name: "Show setup key" }))
    expect(await screen.findByLabelText("Setup key")).toHaveValue(
      "ABCDEFGHIJKLMNOP",
    )
    await user.type(screen.getByLabelText("Six-digit code"), "123456")
    await user.click(screen.getByRole("button", { name: "Verify and enable" }))

    await waitFor(() =>
      expect(api.confirmMfaEnrollment).toHaveBeenCalledWith("123456"),
    )
    expect(await screen.findByText("recovery-one")).toBeVisible()
    expect(refresh).toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
  })

  it("does not request business audit history before the server grants read access", async () => {
    const listSecurityEvents = vi.fn()
    const api: ControlSecurityApi = {
      beginMfaEnrollment: vi.fn(),
      confirmMfaEnrollment: vi.fn(),
      regenerateRecoveryCodes: vi.fn(),
      removeMfa: vi.fn(),
      listSecurityEvents,
    }

    render(
      <SecurityWorkspace
        api={api}
        session={{
          ...session,
          access: {
            ...session.access,
            capabilities: ["control:view", "auth:mfa:enroll"],
          },
        }}
        onSessionRefresh={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "Set up MFA" })).toBeVisible()
    expect(screen.queryByText("Security history")).not.toBeInTheDocument()
    expect(listSecurityEvents).not.toHaveBeenCalled()
  })

  it("renders only the server-redacted security event projection", async () => {
    const api: ControlSecurityApi = {
      beginMfaEnrollment: vi.fn(),
      confirmMfaEnrollment: vi.fn(),
      regenerateRecoveryCodes: vi.fn(),
      removeMfa: vi.fn(),
      listSecurityEvents: vi.fn().mockResolvedValue({
        events: [
          {
            id: "f24f3d2a-f915-4e79-90be-1f60b9e67127",
            eventType: "auth.workforce_session_revoked",
            resourceType: "workforce_membership",
            actorDisplayName: "Olivia Press",
            createdAt: "2026-08-01T12:00:00.000Z",
          },
        ],
        nextCursor: null,
      }),
    }

    render(
      <SecurityWorkspace
        api={api}
        session={{
          ...session,
          access: {
            ...session.access,
            capabilities: ["control:view", "security:read"],
          },
        }}
        onSessionRefresh={vi.fn()}
      />,
    )

    expect(
      await screen.findAllByText("Workforce Session Revoked"),
    ).toHaveLength(2)
    expect(screen.getAllByText("Team membership")).toHaveLength(2)
    expect(screen.getAllByText("Olivia Press")).toHaveLength(3)
  })

  it("confirms removing MFA in a modal before changing account security", async () => {
    const removeMfa = vi.fn().mockResolvedValue(undefined)
    const api: ControlSecurityApi = {
      beginMfaEnrollment: vi.fn(),
      confirmMfaEnrollment: vi.fn(),
      regenerateRecoveryCodes: vi.fn(),
      removeMfa,
      listSecurityEvents: vi.fn().mockResolvedValue({
        events: [],
        nextCursor: null,
      }),
    }
    const refresh = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(
      <SecurityWorkspace
        api={api}
        session={{
          ...session,
          access: {
            ...session.access,
            capabilities: ["control:view", "security:read", "security:write"],
          },
        }}
        onSessionRefresh={refresh}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Remove MFA" }))
    expect(screen.getByRole("alertdialog")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Confirm" }))

    await waitFor(() => expect(removeMfa).toHaveBeenCalledOnce())
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("renders Spanish security copy and dates with the Spanish US locale", async () => {
    await i18next.changeLanguage("es")
    const api: ControlSecurityApi = {
      beginMfaEnrollment: vi.fn(),
      confirmMfaEnrollment: vi.fn(),
      regenerateRecoveryCodes: vi.fn(),
      removeMfa: vi.fn(),
      listSecurityEvents: vi.fn().mockResolvedValue({
        events: [],
        nextCursor: null,
      }),
    }

    render(
      <SecurityWorkspace
        api={api}
        session={session}
        onSessionRefresh={vi.fn()}
      />,
    )

    expect(
      screen.getByRole("heading", { name: "Seguridad de la cuenta" }),
    ).toBeVisible()
    expect(screen.getByRole("button", { name: "Configurar MFA" })).toBeVisible()
    expect(
      screen.getByText(
        new Intl.DateTimeFormat("es-US", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(session.expiresAt)),
      ),
    ).toBeVisible()
  })

  it("renders emitted workforce security events in Spanish", async () => {
    await i18next.changeLanguage("es")
    const api: ControlSecurityApi = {
      beginMfaEnrollment: vi.fn(),
      confirmMfaEnrollment: vi.fn(),
      regenerateRecoveryCodes: vi.fn(),
      removeMfa: vi.fn(),
      listSecurityEvents: vi.fn().mockResolvedValue({
        events: [
          {
            id: "cc8d0953-2575-4db9-9863-60b647074637",
            eventType: "auth.workforce_membership_suspend",
            resourceType: "workforce_membership",
            actorDisplayName: "Olivia Press",
            createdAt: "2026-08-01T12:00:00.000Z",
          },
          {
            id: "db3aac1b-38f5-42e1-a8bb-bfdbe3bd29c2",
            eventType: "auth.workforce_membership_reactivate",
            resourceType: "workforce_membership",
            actorDisplayName: "Olivia Press",
            createdAt: "2026-08-01T11:00:00.000Z",
          },
          {
            id: "f45783eb-aade-4836-85ca-952a87c5cc9c",
            eventType: "auth.workforce_membership_end",
            resourceType: "workforce_membership",
            actorDisplayName: "Olivia Press",
            createdAt: "2026-08-01T10:00:00.000Z",
          },
          {
            id: "3d329961-475a-4c07-b549-65b9dd894edb",
            eventType: "auth.workforce_sessions_revoked",
            resourceType: "workforce_membership",
            actorDisplayName: "Olivia Press",
            createdAt: "2026-08-01T09:00:00.000Z",
          },
        ],
        nextCursor: null,
      }),
    }

    render(
      <SecurityWorkspace
        api={api}
        session={{
          ...session,
          access: {
            ...session.access,
            capabilities: ["control:view", "security:read"],
          },
        }}
        onSessionRefresh={vi.fn()}
      />,
    )

    expect(
      await screen.findAllByText("Membresía del personal suspendida"),
    ).toHaveLength(2)
    expect(
      screen.getAllByText("Membresía del personal reactivada"),
    ).toHaveLength(2)
    expect(
      screen.getAllByText("Membresía del personal finalizada"),
    ).toHaveLength(2)
    expect(screen.getAllByText("Sesiones del personal revocadas")).toHaveLength(
      2,
    )
  })
})
