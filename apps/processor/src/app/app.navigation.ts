import {
  IconAdjustmentsHorizontal,
  IconCalendarClock,
  IconLayoutBoard,
} from "@tabler/icons-react"

export type WorkspaceView = "schedule" | "board" | "settings"

export type WorkspaceRoute = Readonly<{
  view: WorkspaceView
  shiftId: string | null
  runId: string | null
}>

export const workspaceNavigation = [
  { id: "schedule" as const, label: "Schedule", icon: IconCalendarClock },
  { id: "board" as const, label: "Production", icon: IconLayoutBoard },
  {
    id: "settings" as const,
    label: "Configuration",
    icon: IconAdjustmentsHorizontal,
  },
] as const

export const workspaceCopy: Record<WorkspaceView, [string, string]> = {
  schedule: [
    "Schedule",
    "Plan whole orders through one fixed production pulse.",
  ],
  board: ["Production", "Advance started work from sorting through folding."],
  settings: [
    "Configuration",
    "Manage appearance and review immutable scheduler inputs.",
  ],
}

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
