import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import App from "@/app/app"
import {
  makeProcessorRuntime,
  type ProcessorRuntime,
} from "@/app/app.composition"
import { resolveLocationSelection, useProcessorAppModel } from "@/app/app.model"
import { ThemeProvider } from "@/app/providers"
import {
  makeTestProductionPort,
  testIdempotency,
  testLocation,
  testOrderItems,
  testWorkspace,
} from "../fixtures/production.fixture"

const session = {
  status: "authenticated" as const,
  principal: {
    identityId: "00000000-0000-4000-8000-000000000099",
    displayName: "Olivia Press",
    email: "olivia@example.com",
    roles: ["operator" as const],
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

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

const makeFetch = (restoreStatus = 200) =>
  vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = String(request)
    if (url.endsWith("/processor/auth/session"))
      return response(session, restoreStatus)
    if (url.endsWith("/processor/auth/login")) return response(session)
    if (url.endsWith("/production/locations"))
      return response({ items: [testLocation], asOf: testWorkspace.asOf })
    if (url.endsWith(`/production/locations/${testLocation.id}/workspace`))
      return response(testWorkspace)
    if (url.includes(`/production/locations/${testLocation.id}/orders?`))
      return response({
        items: testOrderItems,
        nextCursor: null,
        asOf: testWorkspace.asOf,
      })
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
    window.history.replaceState(null, "", "/")
    window.localStorage.clear()
    document.documentElement.className = ""
  })

  it("restores a cookie session, discovers locations, and resumes live workspace", async () => {
    const fetch = makeFetch()
    renderApp(fetch)

    expect(
      await screen.findByRole("heading", { name: "Production schedule" })
    ).toBeInTheDocument()
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
  })

  it("asks for a location only when several are available without a valid preference", async () => {
    const user = userEvent.setup()
    const otherLocation = {
      ...testLocation,
      id: "plant-west",
      name: "West Plant",
      timezone: "America/Denver",
    }
    const baseFetch = makeFetch()
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
      await screen.findByRole("heading", { name: "Production schedule" })
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
    const staleWorkspace = deferred<typeof testWorkspace>()
    const staleOrders = deferred<{
      items: Array<(typeof testOrderItems)[number]>
      nextCursor: null
      asOf: string
    }>()
    let eastWorkspaceCalls = 0
    let eastOrderCalls = 0
    const runtime: ProcessorRuntime = {
      authentication: {
        restore: async () => session,
        login: async () => session,
        completeMfa: async () => session,
        logout: async () => undefined,
      },
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
        listOrders: async ({ locationId }) => {
          if (locationId === otherLocation.id)
            return {
              items: otherOrders,
              nextCursor: null,
              asOf: otherWorkspace.asOf,
            }
          eastOrderCalls += 1
          return eastOrderCalls === 1
            ? {
                items: [...structuredClone(testOrderItems)],
                nextCursor: null,
                asOf: testWorkspace.asOf,
              }
            : staleOrders.promise
        },
      }),
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

    act(() => result.current.selectLocation(otherLocation.id))
    await waitFor(() =>
      expect(result.current.workspace?.location.id).toBe(otherLocation.id)
    )

    await act(async () => {
      staleWorkspace.resolve(structuredClone(testWorkspace))
      staleOrders.resolve({
        items: [...structuredClone(testOrderItems)],
        nextCursor: null,
        asOf: testWorkspace.asOf,
      })
      await olderRefresh
    })

    expect(result.current.workspace?.location.id).toBe(otherLocation.id)
    expect(result.current.orders).toEqual(otherOrders)
    expect(result.current.workspaceLoading).toBe(false)
  })

  it("recovers from an absent session through login without browser credentials", async () => {
    const user = userEvent.setup()
    const fetch = makeFetch(401)
    renderApp(fetch)

    await user.type(await screen.findByLabelText("Email"), "olivia@example.com")
    await user.type(screen.getByLabelText("Password"), "correct-horse")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(
      await screen.findByRole("heading", { name: "Production schedule" })
    ).toBeInTheDocument()
    expect(JSON.stringify(window.localStorage)).not.toMatch(
      /correct-horse|csrf/
    )
  })

  it("persists only the explicit light or dark appearance choice", async () => {
    const user = userEvent.setup()
    renderApp(makeFetch())
    await screen.findByRole("heading", { name: "Production schedule" })

    await user.click(
      screen.getAllByRole("button", { name: "Configuration" })[0]!
    )
    await user.click(screen.getByRole("radio", { name: "Dark" }))
    expect(document.documentElement).toHaveClass("dark")
    expect(window.localStorage.getItem("theme")).toBe("dark")
  })

  it("defines the web palette, status, focus, and reduced-motion tokens", async () => {
    const css = await readFile(resolve(process.cwd(), "src/index.css"), "utf8")
    expect(css).toContain("--primary: #4285f4;")
    expect(css).toContain("--primary: #8ab4f8;")
    expect(css).toContain("--sidebar-accent: #e8f0fe;")
    expect(css).toContain("--success:")
    expect(css).toContain("--warning:")
    expect(css).toContain("prefers-reduced-motion")
    expect(css).toContain(":focus-visible")
  })
})
