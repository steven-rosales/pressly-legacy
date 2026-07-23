import {
  IconAdjustmentsHorizontal,
  IconCalendarClock,
  IconHistory,
  IconHome,
  IconLayoutBoard,
  IconPackageImport,
} from "@tabler/icons-react"

export type WorkspaceView =
  | "home"
  | "intake"
  | "schedule"
  | "board"
  | "history"
  | "settings"

export type WorkspaceRoute = Readonly<{
  view: WorkspaceView
  shiftId: string | null
  runId: string | null
}>

export const workspaceNavigation = [
  { id: "home" as const, labelKey: "navigation.home" as const, icon: IconHome },
  {
    id: "intake" as const,
    labelKey: "navigation.intake" as const,
    icon: IconPackageImport,
  },
  {
    id: "board" as const,
    labelKey: "navigation.production" as const,
    icon: IconLayoutBoard,
  },
  {
    id: "schedule" as const,
    labelKey: "navigation.schedule" as const,
    icon: IconCalendarClock,
  },
  {
    id: "history" as const,
    labelKey: "navigation.history" as const,
    icon: IconHistory,
  },
  {
    id: "settings" as const,
    labelKey: "navigation.configuration" as const,
    icon: IconAdjustmentsHorizontal,
  },
] as const

export const workspaceCopyKeys = {
  home: ["navigation.home", "navigation.homeDescription"],
  intake: ["navigation.intake", "navigation.intakeDescription"],
  schedule: ["navigation.schedule", "navigation.scheduleDescription"],
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
  if (route.view === "intake") return "/intake"
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
  if (view === "home" || view === "intake" || view === "history")
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
