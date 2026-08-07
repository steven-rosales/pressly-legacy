import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import i18next from "i18next"
import ControlApp, { type ControlRuntime } from "@/app/control-app"
import { localizeApplicationDestination } from "@/app/application-destinations"
import { ThemeProvider } from "@/app/theme-provider"
import type { ControlAuthenticatedSession } from "@pressly/contracts/auth"

const applications: ControlAuthenticatedSession["access"]["applications"] = [
  {
    id: "processor",
    label: "Pressly Processor",
    description: "Run laundry production.",
    href: "http://localhost:4173/",
  },
  {
    id: "control",
    label: "Pressly Control",
    description: "Manage the business.",
    href: "http://localhost:4174/",
  },
]

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
    locations: [],
    selectedLocationId: null,
    capabilities,
    applications,
  },
  expiresAt: "2030-07-30T12:00:00.000Z",
  csrfToken: "a".repeat(43),
})

const runtimeFor = (
  authenticatedSession: ControlAuthenticatedSession,
): ControlRuntime => ({
  authentication: {
    restore: vi.fn().mockResolvedValue(authenticatedSession),
    login: vi.fn(),
    completeMfa: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
  },
  team: {} as ControlRuntime["team"],
  security: {} as ControlRuntime["security"],
  invitations: {} as ControlRuntime["invitations"],
  customers: {} as ControlRuntime["customers"],
  orders: {} as ControlRuntime["orders"],
  initialInvitationToken: null,
})

const renderControl = (
  capabilities: ControlAuthenticatedSession["access"]["capabilities"],
) =>
  render(
    <ThemeProvider>
      <ControlApp runtime={runtimeFor(session(capabilities))} />
    </ThemeProvider>,
  )

describe("Control application shell", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/")
  })

  it("shows Home destinations only for workspaces granted by server capabilities", async () => {
    renderControl(["control:view", "orders:read"])

    await screen.findByText("Available workspaces")
    const main = screen.getByRole("main")

    expect(within(main).getByText("Orders")).toBeVisible()
    expect(within(main).getByText("Configuration")).toBeVisible()
    expect(within(main).queryByText("Customers")).not.toBeInTheDocument()
    expect(within(main).queryByText("Team")).not.toBeInTheDocument()
    expect(within(main).queryByText("Security")).not.toBeInTheDocument()
    expect(
      within(main).getByRole("button", { name: "Open Orders" }),
    ).toBeVisible()
    expect(
      within(main).getByRole("button", { name: "Open Configuration" }),
    ).toBeVisible()
  })

  it("renders an explicit unknown-route state and returns to Home", async () => {
    window.history.replaceState(null, "", "/missing-workspace")
    const user = userEvent.setup()
    renderControl(["control:view"])

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Workspace not found",
      }),
    ).toBeVisible()
    expect(screen.queryByText("Available workspaces")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Return home" }))

    expect(await screen.findByText("Available workspaces")).toBeVisible()
    expect(window.location.pathname).toBe("/")
  })

  it("localizes known application destinations in the switcher", async () => {
    await i18next.changeLanguage("es")
    const user = userEvent.setup()
    renderControl(["control:view"])

    await screen.findByText("Espacios disponibles")
    await user.click(
      screen.getByRole("button", {
        name: "Cambiar desde Control de Pressly",
      }),
    )

    expect(await screen.findByText("Procesador Pressly")).toBeVisible()
  })

  it("preserves an unknown application destination as a safe fallback", () => {
    const destination = {
      id: "future-dispatch",
      label: "Pressly Dispatch",
      description: "Coordinate drivers.",
      href: "https://dispatch.trypressly.com/",
    }

    expect(
      localizeApplicationDestination(destination, {
        processor: {
          label: "Procesador Pressly",
          description: "Opera la producción de lavandería.",
        },
        control: {
          label: "Control de Pressly",
          description: "Administra el negocio.",
        },
      }),
    ).toBe(destination)
  })
})
