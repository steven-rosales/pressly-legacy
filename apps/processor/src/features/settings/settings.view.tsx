import { IconCheck, IconDatabase, IconLock } from "@tabler/icons-react"
import type { ProductionShift, SchedulerConfig } from "@pressly/contracts"
import { SectionHeading } from "@/components/layout/workspace-primitives"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { AppearanceSettings } from "./appearance-settings.view"

export function SettingsView({
  theme,
  onThemeChange,
  schedulerConfig,
  shift,
}: {
  theme: "light" | "dark"
  onThemeChange: (theme: "light" | "dark") => void
  schedulerConfig: SchedulerConfig | null
  shift: ProductionShift | null
}) {
  return (
    <div className="space-y-6">
      <SectionHeading
        title="Processor configuration"
        description="Manage local appearance and review immutable production inputs."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <AppearanceSettings theme={theme} onThemeChange={onThemeChange} />
        <Card className="bg-background shadow-xs">
          <CardHeader>
            <CardTitle>Fixed pulse v1</CardTitle>
            <CardDescription>
              {schedulerConfig === null
                ? "No scheduler configuration is published"
                : `Current scheduler configuration · version ${schedulerConfig.version}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Pulse duration</p>
                <p className="mt-1 font-semibold">
                  {schedulerConfig === null
                    ? "—"
                    : `${schedulerConfig.pulseMinutes} minutes`}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Folding rate</p>
                <p className="mt-1 font-semibold">
                  {schedulerConfig === null
                    ? "—"
                    : `${schedulerConfig.foldLbsPerFolderMinute} lb/min/person`}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Effective folders
                </p>
                <p className="mt-1 font-semibold">
                  {shift === null
                    ? "—"
                    : `${shift.effectiveFolderCount} employees`}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Pulse capacity</p>
                <p className="mt-1 font-semibold">
                  {schedulerConfig === null || shift === null
                    ? "—"
                    : `${
                        schedulerConfig.pulseMinutes *
                        schedulerConfig.foldLbsPerFolderMinute *
                        shift.effectiveFolderCount
                      } lb folding ceiling`}
                </p>
              </div>
            </div>
            <Separator />
            <div className="space-y-2 text-sm">
              {(schedulerConfig === null
                ? []
                : [
                    "Sorting fits one pulse",
                    "Washing fits one pulse",
                    "Drying fits one pulse",
                  ]
              ).map((label) => (
                <p key={label} className="flex items-center gap-2">
                  <IconCheck className="size-4 text-success-foreground" />
                  {label}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-background shadow-xs">
          <CardHeader>
            <CardTitle>Architecture boundary</CardTitle>
            <CardDescription>
              The processor displays decisions; it does not own production
              rules.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex gap-3 rounded-lg border p-3">
              <IconLock className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Protected opaque session</p>
                <p className="mt-1 text-muted-foreground">
                  The browser sends a same-origin HttpOnly cookie and keeps no
                  reusable credential in JavaScript storage.
                </p>
              </div>
            </div>
            <div className="flex gap-3 rounded-lg border p-3">
              <IconDatabase className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Backend operational truth</p>
                <p className="mt-1 text-muted-foreground">
                  Allowed actions, versions, timing, and conflicts come from the
                  production API.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
