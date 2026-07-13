import {
  IconAdjustmentsHorizontal,
  IconCalendarClock,
  IconLayoutBoard,
} from "@tabler/icons-react"

export type WorkspaceView = "schedule" | "board" | "settings"

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
  board: ["Production", "Advance accepted work from sorting through folding."],
  settings: [
    "Configuration",
    "Manage appearance and review immutable scheduler inputs.",
  ],
}

export const readWorkspaceView = (search: string): WorkspaceView => {
  const requested = new URLSearchParams(search).get("view")
  return requested === "board" || requested === "settings"
    ? requested
    : "schedule"
}

export const withWorkspaceView = (
  currentUrl: string,
  next: WorkspaceView
): string => {
  const url = new URL(currentUrl)
  url.searchParams.set("view", next)
  return url.toString()
}
