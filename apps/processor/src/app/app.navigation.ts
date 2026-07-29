import {
  IconAdjustmentsHorizontal,
  IconCalendarClock,
  IconChartHistogram,
  IconHistory,
  IconHome,
  IconLayoutBoard,
  IconPackage,
  IconPackageImport,
} from "@tabler/icons-react"

export type WorkspaceView =
  | "home"
  | "orders"
  | "intake"
  | "schedule"
  | "forecast"
  | "board"
  | "history"
  | "settings"

export type WorkspaceRoute = Readonly<{
  view: WorkspaceView
  shiftId: string | null
  runId: string | null
}>

export const workspaceHomeNavigation = {
  id: "home" as const,
  labelKey: "navigation.home" as const,
  icon: IconHome,
}

export const workspaceNavigationSections = [
  {
    id: "dailyWork",
    labelKey: "navigation.sections.dailyWork",
    items: [
      {
        id: "intake" as const,
        labelKey: "navigation.intake",
        icon: IconPackageImport,
      },
      {
        id: "schedule" as const,
        labelKey: "navigation.schedule",
        icon: IconCalendarClock,
      },
      {
        id: "board" as const,
        labelKey: "navigation.production",
        icon: IconLayoutBoard,
      },
    ],
  },
  {
    id: "manageReview",
    labelKey: "navigation.sections.manageReview",
    items: [
      {
        id: "orders" as const,
        labelKey: "navigation.orders",
        icon: IconPackage,
      },
      {
        id: "forecast" as const,
        labelKey: "navigation.forecast",
        icon: IconChartHistogram,
      },
      {
        id: "history" as const,
        labelKey: "navigation.history",
        icon: IconHistory,
      },
    ],
  },
  {
    id: "system",
    labelKey: "navigation.sections.system",
    items: [
      {
        id: "settings" as const,
        labelKey: "navigation.configuration",
        icon: IconAdjustmentsHorizontal,
      },
    ],
  },
] as const

export type WorkspaceNavigationItem =
  | typeof workspaceHomeNavigation
  | (typeof workspaceNavigationSections)[number]["items"][number]

export const workspaceNavigation: readonly WorkspaceNavigationItem[] = [
  workspaceHomeNavigation,
  ...workspaceNavigationSections.flatMap<WorkspaceNavigationItem>(
    (section) => section.items
  ),
]

export const workspaceCopyKeys = {
  home: ["navigation.home", "navigation.homeDescription"],
  orders: ["navigation.orders", "navigation.ordersDescription"],
  intake: ["navigation.intake", "navigation.intakeDescription"],
  schedule: ["navigation.schedule", "navigation.scheduleDescription"],
  forecast: ["navigation.forecast", "navigation.forecastDescription"],
  board: ["navigation.production", "navigation.productionDescription"],
  history: ["navigation.history", "navigation.historyDescription"],
  settings: ["navigation.configuration", "navigation.configurationDescription"],
} as const satisfies Record<WorkspaceView, readonly [string, string]>

const decodeSegment = (segment: string | undefined): string | null => {
  if (segment === undefined || segment.length === 0) return null
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

/**
 * Maps the browser path to the small route value consumed by the application
 * model. Query parameters intentionally have no role in Processor navigation.
 */
export const readWorkspaceRoute = (pathname: string): WorkspaceRoute | null => {
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length === 0) return { view: "home", shiftId: null, runId: null }
  if (segments.length === 1 && segments[0] === "history")
    return { view: "history", shiftId: null, runId: null }
  if (segments.length === 1 && segments[0] === "intake")
    return { view: "intake", shiftId: null, runId: null }
  if (segments.length === 1 && segments[0] === "orders")
    return { view: "orders", shiftId: null, runId: null }
  if (segments.length === 1 && segments[0] === "forecast")
    return { view: "forecast", shiftId: null, runId: null }
  if (segments.length === 1 && segments[0] === "configuration")
    return { view: "settings", shiftId: null, runId: null }

  if (
    (segments.length === 1 || segments.length === 2) &&
    segments[0] === "schedule"
  ) {
    const shiftId = decodeSegment(segments[1])
    if (segments.length === 2 && shiftId === null) return null
    return { view: "schedule", shiftId, runId: null }
  }

  if (
    (segments.length === 1 || segments.length === 2) &&
    segments[0] === "production"
  ) {
    const runId = decodeSegment(segments[1])
    if (segments.length === 2 && runId === null) return null
    return { view: "board", shiftId: null, runId }
  }

  return null
}

export const workspaceRoutePath = (route: WorkspaceRoute): string => {
  if (route.view === "home") return "/"
  if (route.view === "orders") return "/orders"
  if (route.view === "intake") return "/intake"
  if (route.view === "forecast") return "/forecast"
  if (route.view === "history") return "/history"
  if (route.view === "settings") return "/configuration"
  if (route.view === "board")
    return route.runId === null
      ? "/production"
      : `/production/${encodeURIComponent(route.runId)}`
  return route.shiftId === null
    ? "/schedule"
    : `/schedule/${encodeURIComponent(route.shiftId)}`
}

export const workspaceRouteForView = (
  view: WorkspaceView,
  identifiers: Partial<Pick<WorkspaceRoute, "shiftId" | "runId">> = {}
): WorkspaceRoute => {
  if (
    view === "home" ||
    view === "orders" ||
    view === "intake" ||
    view === "forecast" ||
    view === "history"
  )
    return { view, shiftId: null, runId: null }
  if (view === "settings")
    return { view: "settings", shiftId: null, runId: null }
  if (view === "board")
    return { view: "board", shiftId: null, runId: identifiers.runId ?? null }
  return {
    view: "schedule",
    shiftId: identifiers.shiftId ?? null,
    runId: null,
  }
}
