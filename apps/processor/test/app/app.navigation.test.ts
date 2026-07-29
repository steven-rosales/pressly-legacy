import { describe, expect, it } from "vitest"
import {
  readWorkspaceRoute,
  workspaceNavigation,
  workspaceNavigationSections,
  workspaceRouteForView,
  workspaceRoutePath,
} from "@/app/app.navigation"

describe("processor browser routes", () => {
  it.each([
    ["/", { view: "home", shiftId: null, runId: null }],
    ["/orders", { view: "orders", shiftId: null, runId: null }],
    ["/intake", { view: "intake", shiftId: null, runId: null }],
    ["/forecast", { view: "forecast", shiftId: null, runId: null }],
    ["/schedule", { view: "schedule", shiftId: null, runId: null }],
    [
      "/schedule/shift%20one",
      { view: "schedule", shiftId: "shift one", runId: null },
    ],
    ["/production", { view: "board", shiftId: null, runId: null }],
    [
      "/production/run%2Fone",
      { view: "board", shiftId: null, runId: "run/one" },
    ],
    ["/configuration", { view: "settings", shiftId: null, runId: null }],
    ["/history", { view: "history", shiftId: null, runId: null }],
  ] as const)("reads %s", (pathname, expected) => {
    expect(readWorkspaceRoute(pathname)).toEqual(expected)
  })

  it("rejects unrecognized or malformed paths", () => {
    expect(readWorkspaceRoute("/schedule/one/more")).toBeNull()
    expect(readWorkspaceRoute("/?view=board")).toBeNull()
    expect(readWorkspaceRoute("/production/%E0%A4%A")).toBeNull()
    expect(readWorkspaceRoute("/forecast/details")).toBeNull()
  })

  it("groups workspaces by daily work, management and review, and system", () => {
    expect(
      workspaceNavigationSections.map((section) => ({
        id: section.id,
        items: section.items.map((item) => item.id),
      }))
    ).toEqual([
      {
        id: "dailyWork",
        items: ["intake", "schedule", "board"],
      },
      {
        id: "manageReview",
        items: ["orders", "forecast", "history"],
      },
      {
        id: "system",
        items: ["settings"],
      },
    ])

    expect(workspaceNavigation.map((item) => item.id)).toEqual([
      "home",
      "intake",
      "schedule",
      "board",
      "orders",
      "forecast",
      "history",
      "settings",
    ])
  })

  it("builds resource paths with only the identity relevant to each view", () => {
    expect(
      workspaceRoutePath(
        workspaceRouteForView("schedule", {
          shiftId: "shift one",
          runId: "ignored",
        })
      )
    ).toBe("/schedule/shift%20one")
    expect(
      workspaceRoutePath(
        workspaceRouteForView("board", {
          shiftId: "ignored",
          runId: "run one",
        })
      )
    ).toBe("/production/run%20one")
    expect(workspaceRoutePath(workspaceRouteForView("settings"))).toBe(
      "/configuration"
    )
    expect(workspaceRoutePath(workspaceRouteForView("home"))).toBe("/")
    expect(workspaceRoutePath(workspaceRouteForView("orders"))).toBe("/orders")
    expect(workspaceRoutePath(workspaceRouteForView("intake"))).toBe("/intake")
    expect(workspaceRoutePath(workspaceRouteForView("forecast"))).toBe(
      "/forecast"
    )
    expect(workspaceRoutePath(workspaceRouteForView("history"))).toBe(
      "/history"
    )
  })
})
