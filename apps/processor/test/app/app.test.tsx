import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ProcessorAuthenticatedSession } from "@pressly/contracts"
import { beforeEach, describe, expect, it, vi } from "vitest"
import App from "@/app/app"
import {
  makeProcessorRuntime,
  type ProcessorRuntime,
} from "@/app/app.composition"
import {
  classifyScheduleContext,
  hasProcessorCapability,
  resolveLocationSelection,
  useProcessorAppModel,
} from "@/app/app.model"
import { englishAppMessages } from "@/i18n"
import { ThemeProvider } from "@/app/providers"
import type { ProductionChangePort } from "@/ports/production-change.port"
import { makeTestOrderManagementPort } from "../fixtures/order-management.fixture"
import {
  makeTestProductionPort,
  testIdempotency,
  testLocation,
  testOrderItems,
  testRemainingDayForecast,
  testWorkspace,
} from "../fixtures/production.fixture"

const session: ProcessorAuthenticatedSession = {
  status: "authenticated" as const,
  principal: {
    identityId: "00000000-0000-4000-8000-000000000099",
    displayName: "Olivia Press",
    email: "olivia@example.com",
  },
  access: {
    locations: [
      {
        id: testLocation.id,
        name: testLocation.name,
        timezone: testLocation.timezone,
        capabilities: [
          "processor:view",
          "production:read",
          "production:priority",
          "production:intake",
          "production:admission",
          "production:stage",
          "production:queue",
        ],
      },
    ],
    applications: [
      {
        id: "processor",
        label: "Pressly Processor",
        description: "Run laundry-floor production.",
        href: "http://localhost:4173",
      },
    ],
  },
  expiresAt: "2099-08-01T20:00:00.000Z",
  csrfToken: "c".repeat(43),
}

const response = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify(
      status >= 400
        ? { ok: false, error: { code: "AUTH_REQUIRED", message: "Sign in" } }
        : { ok: true, data }
    ),
    { status }
  )

const managerSession = (): ProcessorAuthenticatedSession => ({
  ...session,
  access: {
    locations: session.access.locations.map((location) => ({
      ...location,
      capabilities: [
        ...location.capabilities,
        "production:schedule",
        "production:accept",
        "production:start",
        "production:override",
        "production:resources",
      ],
    })),
    applications: [
      ...session.access.applications,
      {
        id: "control",
        label: "Pressly Control",
        description: "Manage people, customers, orders, and account security.",
        href: "http://localhost:4174",
      },
    ],
  },
})

const sessionForLocations = (
  locations: readonly (typeof testLocation)[]
): ProcessorAuthenticatedSession => ({
  ...session,
  access: {
    ...session.access,
    locations: locations.map((location) => ({
      id: location.id,
      name: location.name,
      timezone: location.timezone,
      capabilities: session.access.locations[0]!.capabilities,
    })),
  },
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

const makeFetch = (
  restoreStatus = 200,
  restoredSession: typeof session = session
) =>
  vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = String(request)
    if (url.endsWith("/processor/auth/session"))
      return response(restoredSession, restoreStatus)
    if (url.endsWith("/processor/auth/login")) return response(session)
    if (url.endsWith("/production/locations"))
      return response({ items: [testLocation], asOf: testWorkspace.asOf })
    if (url.includes(`/production/locations/${testLocation.id}/workspace`))
      return response(testWorkspace)
    if (url.includes(`/production/locations/${testLocation.id}/forecast?`))
      return response(testRemainingDayForecast)
    if (
      url.endsWith(
        `/production/locations/${testLocation.id}/runs/${testWorkspace.activeRuns[0]!.id}/board`
      )
    )
      return response(testWorkspace.board)
    if (url.includes(`/production/locations/${testLocation.id}/orders?`))
      return response({
        items: testOrderItems,
        nextCursor: null,
        asOf: testWorkspace.asOf,
      })
    if (url.includes(`/production/locations/${testLocation.id}/order-control?`))
      return response({
        items: [],
        counts: { attention: 0, active: 0, all: 0 },
        nextCursor: null,
        asOf: testWorkspace.asOf,
      })
    if (
      url.includes(
        `/order-management/locations/${testLocation.id}/incoming-orders?`
      )
    )
      return response({ items: [], nextCursor: null })
    if (url.endsWith("/processor/auth/logout"))
      return response({ revoked: true })
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`)
  })

const renderApp = (fetch: typeof globalThis.fetch) =>
  render(
    <ThemeProvider defaultTheme="light" disableTransitionOnChange={false}>
      <App
        runtime={makeProcessorRuntime({
          apiBaseUrl: "/api",
          storage: window.localStorage,
          fetch,
          now: () => new Date("2026-08-01T13:15:00.000Z"),
        })}
      />
    </ThemeProvider>
  )

describe("processor application composition", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/schedule")
    window.localStorage.clear()
    document.documentElement.className = ""
  })

  it("uses the root as a compact operator overview without manager-only work", async () => {
    const fetch = makeFetch()
    window.history.replaceState(null, "", "/")

    renderApp(fetch)

    expect(await screen.findByRole("heading", { name: "Home" })).toBeVisible()
    expect(
      screen.queryByRole("region", { name: "Order attention" })
    ).not.toBeInTheDocument()
    expect(await screen.findByText("Remaining today")).toBeVisible()
    expect(
      screen.queryByRole("heading", { name: "Order control" })
    ).not.toBeInTheDocument()
    expect(
      fetch.mock.calls.some(([request]) =>
        String(request).includes("/order-control")
      )
    ).toBe(false)
    expect(window.location.pathname).toBe("/")
  })

  it("filters operator navigation and replaces a manager-only direct route", async () => {
    window.history.replaceState(null, "", "/configuration")
    renderApp(makeFetch())

    expect(
      await screen.findByRole("heading", { name: "Home", level: 1 })
    ).toBeVisible()
    expect(window.location.pathname).toBe("/")
    expect(screen.getByRole("button", { name: "Intake" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Production" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Forecast" })).toBeVisible()
    expect(screen.getByRole("button", { name: "History" })).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Schedule" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Orders" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Configuration" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: "Published production pulse" })
    ).not.toBeInTheDocument()
  })

  it("keeps order control and old-order review on the dedicated Orders route", async () => {
    const user = userEvent.setup()
    const privilegedSession = managerSession()
    window.history.replaceState(null, "", "/orders")

    const { unmount } = renderApp(makeFetch(200, privilegedSession))

    expect(
      await screen.findByRole("heading", { name: "Orders", level: 1 })
    ).toBeVisible()
    expect(
      await screen.findByRole("heading", { name: "Reported orders" })
    ).toBeVisible()
    await user.click(screen.getByRole("tab", { name: "Current orders" }))
    expect(
      await screen.findByRole("heading", { name: "Archive from active work" })
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Review old orders" })
    ).toBeVisible()

    unmount()
  })

  it("opens Orders from the Home attention digest", async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, "", "/")
    renderApp(makeFetch(200, managerSession()))
    await screen.findByRole("region", { name: "Order attention" })

    await user.click(screen.getByRole("button", { name: "Open Orders" }))

    expect(
      await screen.findByRole("heading", { name: "Orders", level: 1 })
    ).toBeVisible()
    expect(
      await screen.findByRole("heading", { name: "Reported orders", level: 2 })
    ).toBeVisible()
    expect(window.location.pathname).toBe("/orders")
  })

  it("opens the detailed remaining-day outlook on its dedicated route", async () => {
    const fetch = makeFetch()
    window.history.replaceState(null, "", "/forecast")

    renderApp(fetch)

    expect(
      await screen.findByRole("heading", { name: "Forecast", level: 1 })
    ).toBeVisible()
    expect(
      await screen.findByRole("heading", { name: "Remaining day", level: 2 })
    ).toBeVisible()
    expect(await screen.findByText("Order C-2001")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Open Schedule" })
    ).not.toBeInTheDocument()
    expect(
      screen.getAllByRole("button", { name: "Open Production" }).length
    ).toBeGreaterThan(0)
    expect(window.location.pathname).toBe("/forecast")
    expect(
      fetch.mock.calls.some(([request]) =>
        String(request).includes(
          `/production/locations/${testLocation.id}/forecast?serviceDay=2026-08-01`
        )
      )
    ).toBe(true)
  })

  it("opens Forecast from the desktop workspace navigation", async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, "", "/")
    renderApp(makeFetch())
    await screen.findByRole("heading", { name: "Home", level: 1 })

    await user.click(screen.getByRole("button", { name: "Forecast" }))

    expect(
      await screen.findByRole("heading", { name: "Forecast", level: 1 })
    ).toBeVisible()
    expect(window.location.pathname).toBe("/forecast")
  })

  it("keeps Home order attention available when the forecast request fails", async () => {
    const baseFetch = makeFetch(200, managerSession())
    const fetch = vi.fn(
      async (request: RequestInfo | URL, init?: RequestInit) =>
        String(request).includes("/forecast?")
          ? Promise.reject(new Error("forecast unavailable"))
          : baseFetch(request, init)
    )
    window.history.replaceState(null, "", "/")

    renderApp(fetch)

    expect(
      await screen.findByRole("region", { name: "Order attention" })
    ).toBeVisible()
    expect(
      await screen.findByText("Remaining-day outlook is unavailable")
    ).toBeVisible()
  })

  it("keeps incoming-order work on the dedicated Intake route", async () => {
    const fetch = makeFetch()
    window.history.replaceState(null, "", "/intake")

    renderApp(fetch)

    expect(
      await screen.findByRole("heading", { name: "Intake", level: 1 })
    ).toBeVisible()
    expect(
      await screen.findByRole("heading", { name: "Order intake", level: 2 })
    ).toBeVisible()
    expect(await screen.findByText(/Updated/i)).toBeVisible()
    expect(window.location.pathname).toBe("/intake")
    expect(
      fetch.mock.calls.some(([request]) =>
        String(request).includes(
          `/production/locations/${testLocation.id}/order-control?`
        )
      )
    ).toBe(true)
  })

  it("restores a cookie session, discovers locations, and resumes live workspace", async () => {
    const fetch = makeFetch(200, managerSession())
    renderApp(fetch)

    expect(
      await screen.findByRole("heading", { name: "Schedule" })
    ).toBeInTheDocument()
    expect(
      await screen.findByRole("heading", {
        name: "Live run changes",
        level: 2,
      })
    ).toBeVisible()
    expect(await screen.findByTestId("forecast-summary-schedule")).toBeVisible()
    expect(
      screen.getByText(/East Plant · America\/Chicago/)
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("Signed in as Olivia Press")
    ).toBeInTheDocument()
    expect(window.localStorage.getItem("pressly.processor.location")).toBe(
      testLocation.id
    )
    expect(
      screen.queryByLabelText("Production location")
    ).not.toBeInTheDocument()
    expect(JSON.stringify(fetch.mock.calls)).not.toContain("Authorization")
    await waitFor(() =>
      expect(window.location.pathname).toBe(
        `/schedule/${testWorkspace.currentShift!.id}`
      )
    )
  })

  it("shows only server-provided application destinations", async () => {
    renderApp(makeFetch(200, managerSession()))

    await screen.findByRole("heading", { name: "Schedule" })
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Switch from Pressly Processor" }),
      { button: 0, ctrlKey: false }
    )

    expect(
      screen.getByRole("menuitem", { name: /Pressly Control/i })
    ).toHaveAttribute("href", "http://localhost:4174")
  })

  it("locks a shared-floor session in one action and clears operational state", async () => {
    const user = userEvent.setup()
    const fetch = makeFetch()
    window.history.replaceState(
      null,
      "",
      `/production/${testWorkspace.activeRuns[0]!.id}`
    )
    renderApp(fetch)

    await screen.findByRole("heading", { name: "Production" })
    await user.click(
      screen.getByRole("button", { name: "Lock / switch employee" })
    )

    expect(await screen.findByLabelText("Email")).toBeVisible()
    expect(
      screen.queryByRole("heading", { name: "Production" })
    ).not.toBeInTheDocument()
    expect(
      fetch.mock.calls.some(
        ([request, init]) =>
          String(request).endsWith("/processor/auth/logout") &&
          init?.method === "POST" &&
          init.credentials === "same-origin"
      )
    ).toBe(true)
  })

  it("uses one mobile navigation surface and closes its drawer after selection", async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, "", "/")
    renderApp(makeFetch())
    await screen.findByRole("heading", { name: "Home" })

    expect(
      screen.getAllByRole("navigation", { name: "Processor" })
    ).toHaveLength(1)

    await user.click(screen.getByRole("button", { name: "Open navigation" }))
    const drawer = await screen.findByRole("dialog", {
      name: "Processor navigation",
    })
    expect(within(drawer).getByText("Daily work")).toBeVisible()
    expect(within(drawer).getByText("Manage & review")).toBeVisible()
    expect(within(drawer).queryByText("System")).not.toBeInTheDocument()
    expect(
      within(drawer).queryByRole("button", { name: "Orders" })
    ).not.toBeInTheDocument()
    expect(
      within(drawer).queryByRole("button", { name: "Schedule" })
    ).not.toBeInTheDocument()
    expect(
      within(drawer).getByRole("button", { name: "Forecast" })
    ).toBeVisible()
    await user.click(within(drawer).getByRole("button", { name: "Production" }))

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Processor navigation" })
      ).not.toBeInTheDocument()
    )
    expect(window.location.pathname).toBe(
      `/production/${testWorkspace.activeRuns[0]!.id}`
    )
  })

  it("publishes the Pressly Processor tab identity", async () => {
    const [html, favicon, canonicalFavicon] = await Promise.all([
      readFile(resolve(process.cwd(), "index.html"), "utf8"),
      readFile(resolve(process.cwd(), "public/favicon.ico")),
      readFile(resolve(process.cwd(), "../web/public/logo/favicon.ico")),
    ])

    expect(html).toContain('<link rel="icon" href="/favicon.ico" />')
    expect(html).toContain("<title>Pressly Processor</title>")
    expect(favicon.equals(canonicalFavicon)).toBe(true)
  })

  it("asks for a location only when several are available without a valid preference", async () => {
    const user = userEvent.setup()
    const otherLocation = {
      ...testLocation,
      id: "plant-west",
      name: "West Plant",
      timezone: "America/Denver",
    }
    const baseFetch = makeFetch(
      200,
      sessionForLocations([testLocation, otherLocation])
    )
    const fetch = vi.fn(
      async (request: RequestInfo | URL, init?: RequestInit) => {
        if (String(request).endsWith("/production/locations"))
          return response({
            items: [testLocation, otherLocation],
            asOf: testWorkspace.asOf,
          })
        return baseFetch(request, init)
      }
    )

    renderApp(fetch)

    expect(
      await screen.findByRole("heading", {
        name: "Choose a production location",
      })
    ).toBeInTheDocument()
    expect(window.localStorage.getItem("pressly.processor.location")).toBeNull()
    expect(
      fetch.mock.calls.some(([request]) =>
        String(request).includes("/workspace")
      )
    ).toBe(false)

    await user.click(screen.getByLabelText("Production location"))
    await user.click(await screen.findByRole("option", { name: "East Plant" }))

    expect(
      await screen.findByRole("heading", { name: "Home" })
    ).toBeInTheDocument()
    expect(window.localStorage.getItem("pressly.processor.location")).toBe(
      testLocation.id
    )
    expect(screen.getByLabelText("Production location")).toHaveTextContent(
      "East Plant"
    )
  })

  it("shows a truthful empty state when no active location is available", async () => {
    const baseFetch = makeFetch()
    const fetch = vi.fn(
      async (request: RequestInfo | URL, init?: RequestInit) =>
        String(request).endsWith("/production/locations")
          ? response({ items: [], asOf: testWorkspace.asOf })
          : baseFetch(request, init)
    )

    renderApp(fetch)

    expect(
      await screen.findByRole("heading", {
        name: "No production location is available",
      })
    ).toBeInTheDocument()
    expect(screen.getByText(/configuration or your assignment/i)).toBeVisible()
  })

  it("resolves one location automatically but never guesses among several", () => {
    const west = { ...testLocation, id: "plant-west" }
    expect(
      resolveLocationSelection({
        locations: [testLocation],
        currentLocationId: null,
        preferredLocationId: null,
      })
    ).toBe(testLocation.id)
    expect(
      resolveLocationSelection({
        locations: [testLocation, west],
        currentLocationId: null,
        preferredLocationId: null,
      })
    ).toBeNull()
    expect(
      resolveLocationSelection({
        locations: [testLocation, west],
        currentLocationId: null,
        preferredLocationId: west.id,
      })
    ).toBe(west.id)
  })

  it("derives browser controls from the selected location capabilities", () => {
    const privilegedSession = managerSession()

    expect(
      hasProcessorCapability(session, testLocation.id, "production:override")
    ).toBe(false)
    expect(
      hasProcessorCapability(
        privilegedSession,
        testLocation.id,
        "production:override"
      )
    ).toBe(true)
    expect(
      hasProcessorCapability(
        privilegedSession,
        "not-an-authorized-location",
        "production:read"
      )
    ).toBe(false)
  })

  it("routes a started run to live Schedule changes while dropping completed implicit history", () => {
    expect(
      classifyScheduleContext({
        workspace: testWorkspace,
        requestedShiftId: testWorkspace.currentShift!.id,
        now: new Date("2026-08-01T14:00:00.000Z"),
      })
    ).toMatchObject({
      kind: "live",
      productionRun: { id: testWorkspace.board!.productionRun.id },
      changes: {
        productionRunId: testWorkspace.board!.productionRun.id,
      },
    })
    expect(
      classifyScheduleContext({
        workspace: testWorkspace,
        requestedShiftId: null,
        now: new Date("2026-08-01T14:00:00.000Z"),
      })
    ).toMatchObject({
      kind: "live",
      productionRun: { status: "started" },
    })

    const completedWorkspace = structuredClone(testWorkspace)
    completedWorkspace.board!.productionRun.status = "completed"
    expect(
      classifyScheduleContext({
        workspace: completedWorkspace,
        requestedShiftId: null,
        now: new Date("2026-08-01T14:00:00.000Z"),
      })
    ).toEqual({ kind: "planning", shift: null, proposal: null })
  })

  it("keeps completed shifts read-only and reloads a fresh planning workspace", async () => {
    const user = userEvent.setup()
    const completedWorkspace = structuredClone(testWorkspace)
    completedWorkspace.currentShift!.status = "closed"
    completedWorkspace.currentScheduleProposal = null
    completedWorkspace.activeRuns = []
    completedWorkspace.candidateShifts = []
    completedWorkspace.board!.productionShift.status = "closed"
    completedWorkspace.board!.productionRun.status = "completed"
    completedWorkspace.board!.productionRun.version += 1
    const freshWorkspace = structuredClone(completedWorkspace)
    freshWorkspace.currentShift = null
    freshWorkspace.board = null
    let defaultWorkspaceLoads = 0
    const privilegedSession = managerSession()
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const url = String(request)
      if (url.endsWith("/processor/auth/session"))
        return response(privilegedSession)
      if (url.endsWith("/production/locations"))
        return response({ items: [testLocation], asOf: testWorkspace.asOf })
      if (url.includes(`/production/locations/${testLocation.id}/workspace`)) {
        if (url.includes("shiftId=")) return response(completedWorkspace)
        defaultWorkspaceLoads += 1
        return response(freshWorkspace)
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    window.history.replaceState(
      null,
      "",
      `/schedule/${completedWorkspace.currentShift!.id}`
    )
    renderApp(fetch)

    expect(await screen.findByText("This shift is complete")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Open production history" })
    ).toBeEnabled()
    expect(
      screen.queryByRole("button", { name: /compute schedule/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /edit shift/i })
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Plan a new shift" }))

    await waitFor(() => expect(window.location.pathname).toBe("/schedule"))
    expect(
      await screen.findByRole("button", { name: "Compute schedule" })
    ).toBeEnabled()
    expect(screen.getByRole("button", { name: "Set shift" })).toBeEnabled()
    expect(defaultWorkspaceLoads).toBe(1)
  })

  it("does not let an older location refresh overwrite newer workspace state", async () => {
    const otherLocation = {
      ...testLocation,
      id: "plant-west",
      name: "West Plant",
      timezone: "America/Denver",
    }
    const otherWorkspace = {
      ...structuredClone(testWorkspace),
      location: otherLocation,
      asOf: "2026-08-01T15:00:00.000Z",
    }
    const otherOrders = testOrderItems.map((order) => ({
      ...structuredClone(order),
      locationId: otherLocation.id,
      externalOrderId: `WEST-${order.externalOrderId}`,
    }))
    otherWorkspace.orders = otherOrders
    const staleWorkspace = deferred<typeof testWorkspace>()
    let eastWorkspaceCalls = 0
    const multipleLocationSession = sessionForLocations([
      testLocation,
      otherLocation,
    ])
    const runtime: ProcessorRuntime = {
      authentication: {
        restore: async () => multipleLocationSession,
        login: async () => multipleLocationSession,
        completeMfa: async () => multipleLocationSession,
        logout: async () => undefined,
      },
      orderManagement: makeTestOrderManagementPort(),
      production: makeTestProductionPort({
        listLocations: async () => ({
          items: [testLocation, otherLocation],
          asOf: testWorkspace.asOf,
        }),
        loadWorkspace: async (locationId) => {
          if (locationId === otherLocation.id) return otherWorkspace
          eastWorkspaceCalls += 1
          return eastWorkspaceCalls === 1
            ? structuredClone(testWorkspace)
            : staleWorkspace.promise
        },
      }),
      productionChanges: {
        subscribe: () => () => undefined,
      },
      locationPreference: {
        read: () => testLocation.id,
        save: vi.fn(),
        clear: vi.fn(),
      },
      idempotency: testIdempotency,
      subscribeToUnauthorized: () => () => undefined,
      now: () => new Date("2026-08-01T13:15:00.000Z"),
    }
    const { result } = renderHook(() => useProcessorAppModel(runtime))

    await waitFor(() =>
      expect(result.current.workspace?.location.id).toBe(testLocation.id)
    )

    let olderRefresh!: Promise<void>
    act(() => {
      olderRefresh = result.current.refreshWorkspace()
    })
    await waitFor(() => expect(eastWorkspaceCalls).toBe(2))

    act(() => {
      result.current.selectLocation(otherLocation.id)
      staleWorkspace.resolve(structuredClone(testWorkspace))
    })
    await waitFor(() =>
      expect(result.current.workspace?.location.id).toBe(otherLocation.id)
    )

    await act(async () => olderRefresh)

    expect(result.current.workspace?.location.id).toBe(otherLocation.id)
    expect(result.current.orders).toEqual(otherOrders)
    expect(result.current.workspaceLoading).toBe(false)
  })

  it("recovers from an absent session through login without browser credentials", async () => {
    const user = userEvent.setup()
    const fetch = makeFetch(401)
    renderApp(fetch)

    await user.type(await screen.findByLabelText("Email"), "olivia@example.com")
    const password = screen.getByLabelText("Password")
    expect(password.closest('[data-slot="card-content"]')).toHaveClass(
      "pb-(--card-spacing)"
    )
    await user.type(password, "correct-horse")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(
      await screen.findByRole("heading", { name: "Home" })
    ).toBeInTheDocument()
    expect(JSON.stringify(window.localStorage)).not.toMatch(
      /correct-horse|csrf/
    )
  })

  it("acknowledges an SSE revision only after its authoritative refresh succeeds", async () => {
    let subscription:
      | Parameters<ProductionChangePort["subscribe"]>[0]
      | undefined
    let workspaceAttempt = 0
    const loadWorkspace = vi.fn(async () => {
      workspaceAttempt += 1
      if (workspaceAttempt === 2) throw new Error("temporary read failure")
      return structuredClone(testWorkspace)
    })
    const runtime: ProcessorRuntime = {
      authentication: {
        restore: async () => session,
        login: async () => session,
        completeMfa: async () => session,
        logout: async () => undefined,
      },
      orderManagement: makeTestOrderManagementPort(),
      production: makeTestProductionPort({
        listLocations: async () => ({
          items: [testLocation],
          asOf: testWorkspace.asOf,
        }),
        loadWorkspace,
      }),
      productionChanges: {
        subscribe: (input) => {
          subscription = input
          return () => undefined
        },
      },
      locationPreference: {
        read: () => testLocation.id,
        save: vi.fn(),
        clear: vi.fn(),
      },
      idempotency: testIdempotency,
      subscribeToUnauthorized: () => () => undefined,
      now: () => new Date("2026-08-01T13:15:00.000Z"),
    }
    const { result } = renderHook(() => useProcessorAppModel(runtime))

    await waitFor(() => expect(loadWorkspace).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(subscription).toBeDefined())

    act(() =>
      subscription!.onInvalidate({
        source: "ready",
        revision: 7,
      })
    )
    await waitFor(() => expect(loadWorkspace).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.workspaceError).not.toBeNull())

    act(() =>
      subscription!.onInvalidate({
        source: "ready",
        revision: 7,
      })
    )
    await waitFor(() => expect(loadWorkspace).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(result.current.workspaceError).toBeNull())

    await act(async () => {
      subscription!.onInvalidate({
        source: "ready",
        revision: 7,
      })
      await Promise.resolve()
    })
    expect(loadWorkspace).toHaveBeenCalledTimes(3)
  })

  it("persists only the explicit light or dark appearance choice", async () => {
    const user = userEvent.setup()
    renderApp(makeFetch(200, managerSession()))
    await screen.findByRole("heading", { name: "Schedule" })

    await user.click(
      screen.getAllByRole("button", { name: "Configuration" })[0]!
    )
    expect(window.location.pathname).toBe("/configuration")
    await user.click(screen.getByRole("radio", { name: "Dark" }))
    expect(document.documentElement).toHaveClass("dark")
    expect(window.localStorage.getItem("theme")).toBe("dark")
  })

  it("follows browser back and forward navigation between real workspace paths", async () => {
    const user = userEvent.setup()
    renderApp(makeFetch(200, managerSession()))
    await screen.findByRole("heading", {
      name: englishAppMessages.navigation.schedule,
    })

    await user.click(screen.getAllByRole("button", { name: "Production" })[0]!)
    await waitFor(() =>
      expect(window.location.pathname).toBe(
        `/production/${testWorkspace.activeRuns[0]!.id}`
      )
    )
    await user.click(
      screen.getAllByRole("button", { name: "Configuration" })[0]!
    )
    expect(window.location.pathname).toBe("/configuration")

    act(() => window.history.back())
    expect(
      await screen.findByRole("heading", {
        name: englishAppMessages.navigation.production,
      })
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe(
      `/production/${testWorkspace.activeRuns[0]!.id}`
    )

    act(() => window.history.forward())
    expect(
      await screen.findByRole("heading", {
        name: englishAppMessages.navigation.configuration,
      })
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe("/configuration")
  })

  it("resumes the production board from URL-persisted shift and run identities", async () => {
    window.history.replaceState(
      null,
      "",
      `/production/${testWorkspace.activeRuns[0]!.id}`
    )
    const fetch = makeFetch()
    renderApp(fetch)

    expect(
      await screen.findByRole("heading", {
        name: englishAppMessages.navigation.production,
      })
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe(
      `/production/${testWorkspace.activeRuns[0]!.id}`
    )
    expect(
      screen.queryByText("Pressly controls production readiness")
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Priority")).not.toBeInTheDocument()
    expect(
      fetch.mock.calls.filter(([request]) =>
        String(request).includes(
          `/production/locations/${testLocation.id}/workspace`
        )
      )
    ).toHaveLength(1)
    expect(
      fetch.mock.calls.some(([request]) =>
        String(request).includes(
          `/production/locations/${testLocation.id}/orders?`
        )
      )
    ).toBe(false)
    expect(
      fetch.mock.calls.some(([request]) =>
        String(request).includes(
          `/production/locations/${testLocation.id}/runs/${testWorkspace.activeRuns[0]!.id}/board`
        )
      )
    ).toBe(false)
  })

  it("re-resolves shift and run identities when the production location changes", async () => {
    const user = userEvent.setup()
    const westLocation = {
      ...testLocation,
      id: "plant-west",
      name: "West Plant",
      timezone: "America/Denver",
    }
    const westShiftId = "00000000-0000-4000-8000-000000000701"
    const westRunId = "00000000-0000-4000-8000-000000000702"
    const westWorkspace = structuredClone(testWorkspace)
    westWorkspace.location = westLocation
    westWorkspace.currentShift!.id = westShiftId
    westWorkspace.currentShift!.locationId = westLocation.id
    westWorkspace.currentShift!.timezone = westLocation.timezone
    westWorkspace.currentScheduleProposal!.productionShiftId = westShiftId
    westWorkspace.activeRuns[0]!.id = westRunId
    westWorkspace.activeRuns[0]!.productionShiftId = westShiftId
    westWorkspace.candidateShifts[0]!.productionShiftId = westShiftId
    westWorkspace.candidateShifts[0]!.productionRunId = westRunId
    westWorkspace.board!.productionShift.id = westShiftId
    westWorkspace.board!.productionShift.locationId = westLocation.id
    westWorkspace.board!.productionShift.timezone = westLocation.timezone
    westWorkspace.board!.productionRun.id = westRunId
    westWorkspace.board!.productionRun.productionShiftId = westShiftId
    const westOrders = testOrderItems.map((order) => ({
      ...structuredClone(order),
      locationId: westLocation.id,
    }))
    westWorkspace.orders = westOrders
    const baseFetch = makeFetch(
      200,
      sessionForLocations([testLocation, westLocation])
    )
    const fetch = vi.fn(
      async (request: RequestInfo | URL, init?: RequestInit) => {
        const url = String(request)
        if (url.endsWith("/production/locations"))
          return response({
            items: [testLocation, westLocation],
            asOf: testWorkspace.asOf,
          })
        if (url.includes(`/production/locations/${westLocation.id}/workspace`))
          return response(westWorkspace)
        if (url.includes(`/production/locations/${westLocation.id}/orders?`))
          return response({
            items: westOrders,
            nextCursor: null,
            asOf: westWorkspace.asOf,
          })
        if (
          url.endsWith(
            `/production/locations/${westLocation.id}/runs/${westRunId}/board`
          )
        )
          return response(westWorkspace.board)
        return baseFetch(request, init)
      }
    )
    window.localStorage.setItem("pressly.processor.location", testLocation.id)
    window.history.replaceState(
      null,
      "",
      `/production/${testWorkspace.activeRuns[0]!.id}`
    )
    renderApp(fetch)

    await screen.findByRole("heading", {
      name: englishAppMessages.navigation.production,
    })
    await user.click(screen.getByLabelText("Production location"))
    await user.click(await screen.findByRole("option", { name: "West Plant" }))

    await waitFor(() =>
      expect(screen.getByText(/West Plant · America\/Denver/)).toBeVisible()
    )
    await waitFor(() => {
      expect(window.location.pathname).toBe(`/production/${westRunId}`)
      expect(window.location.pathname).not.toContain(
        testWorkspace.activeRuns[0]!.id
      )
    })
  })

  it("awaits Start refresh and navigates with the returned production run ID", async () => {
    const user = userEvent.setup()
    const acceptedWorkspace = structuredClone(testWorkspace)
    acceptedWorkspace.currentScheduleProposal!.status = "accepted"
    acceptedWorkspace.currentScheduleProposal!.acceptedAt =
      "2026-08-01T13:45:00.000Z"
    acceptedWorkspace.currentScheduleProposal!.acceptedBy =
      "00000000-0000-4000-8000-000000000099"
    acceptedWorkspace.activeRuns = []
    acceptedWorkspace.board = null
    acceptedWorkspace.candidateShifts = [
      {
        productionShiftId: acceptedWorkspace.currentShift!.id,
        startsAt: acceptedWorkspace.currentShift!.startsAt,
        endsAt: acceptedWorkspace.currentShift!.endsAt,
        reason: "accepted_plan",
        productionRunId: null,
        scheduleRunId: acceptedWorkspace.currentScheduleProposal!.scheduleRunId,
      },
    ]
    const privilegedSession = managerSession()
    let started = false
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const url = String(request)
      if (url.endsWith("/processor/auth/session"))
        return response(privilegedSession)
      if (url.endsWith("/production/locations"))
        return response({ items: [testLocation], asOf: testWorkspace.asOf })
      if (url.includes(`/production/locations/${testLocation.id}/workspace`))
        return response(started ? testWorkspace : acceptedWorkspace)
      if (url.includes(`/production/locations/${testLocation.id}/orders?`))
        return response({
          items: testOrderItems,
          nextCursor: null,
          asOf: testWorkspace.asOf,
        })
      if (
        url.endsWith(
          `/production/locations/${testLocation.id}/schedules/${acceptedWorkspace.currentScheduleProposal!.scheduleRunId}/start`
        )
      ) {
        started = true
        return response({
          scheduleRunId:
            acceptedWorkspace.currentScheduleProposal!.scheduleRunId,
          productionRunId: testWorkspace.activeRuns[0]!.id,
          productionBatchIds: testWorkspace.board!.batches.map(
            (batch) => batch.id
          ),
          queueVersion: 1,
          startedAt: "2026-08-01T14:00:00.000Z",
          replayed: false,
        })
      }
      if (
        url.endsWith(
          `/production/locations/${testLocation.id}/runs/${testWorkspace.activeRuns[0]!.id}/board`
        )
      )
        return response(testWorkspace.board)
      throw new Error(`Unexpected request: ${url}`)
    })
    window.history.replaceState(
      null,
      "",
      `/schedule/${acceptedWorkspace.currentShift!.id}`
    )
    renderApp(fetch)

    await user.click(
      await screen.findByRole("button", { name: "Start production run" })
    )

    expect(
      await screen.findByRole("heading", {
        name: englishAppMessages.navigation.production,
      })
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe(
      `/production/${testWorkspace.activeRuns[0]!.id}`
    )
  })

  it("defines the web palette, status, focus, and reduced-motion tokens", async () => {
    const css = await readFile(resolve(process.cwd(), "src/index.css"), "utf8")
    expect(css).toContain("--sidebar-accent")
    expect(css).toContain("--primary: #4285f4;")
    expect(css).toContain("--primary: #8ab4f8;")
    expect(css).toContain("--sidebar-accent: #e8f0fe;")
    expect(css).toContain("--success:")
    expect(css).toContain("--warning:")
    expect(css).toContain("prefers-reduced-motion")
    expect(css).toContain(":focus-visible")
  })
})
