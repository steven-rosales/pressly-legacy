import type { ReactNode } from "react"
import type { ProductionShift, SchedulerConfig } from "@pressly/contracts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { IdempotencyPort } from "@/ports/idempotency.port"
import type { ProductionPort } from "@/ports/production.port"
import { AppearanceSettings } from "./appearance-settings.view"
import { SchedulerConfigPublication } from "./scheduler-config-publication.view"

function SummaryRow({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex min-h-12 flex-col justify-center gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="m-0 text-sm font-medium sm:text-right">{children}</dd>
    </div>
  )
}

export function SettingsView({
  theme,
  onThemeChange,
  schedulerConfig,
  shift,
  production,
  idempotency,
  locationId,
  canManage,
  onConfigurationPublished,
}: {
  theme: "light" | "dark"
  onThemeChange: (theme: "light" | "dark") => void
  schedulerConfig: SchedulerConfig | null
  shift: ProductionShift | null
  production: ProductionPort
  idempotency: IdempotencyPort
  locationId: string
  canManage: boolean
  onConfigurationPublished: (config: SchedulerConfig) => Promise<void>
}) {
  const pulseCapacity =
    schedulerConfig === null || shift === null
      ? null
      : schedulerConfig.pulseMinutes *
        schedulerConfig.foldLbsPerFolderMinute *
        shift.effectiveFolderCount

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <Card className="bg-background">
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle role="heading" aria-level={2}>
              Published production pulse
            </CardTitle>
            <CardDescription>
              {schedulerConfig === null
                ? "Production scheduling is not configured. Publish a tested pulse before computing a schedule."
                : `Immutable scheduler configuration · version ${schedulerConfig.version}`}
            </CardDescription>
          </div>
          <SchedulerConfigPublication
            production={production}
            idempotency={idempotency}
            locationId={locationId}
            currentConfig={schedulerConfig}
            canManage={canManage}
            onPublished={onConfigurationPublished}
          />
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col" aria-label="Production pulse summary">
            <SummaryRow label="Pulse duration">
              {schedulerConfig === null
                ? "Not published"
                : `${schedulerConfig.pulseMinutes} minutes`}
            </SummaryRow>
            <Separator />
            <SummaryRow label="Folding rate">
              {schedulerConfig === null
                ? "Not published"
                : `${schedulerConfig.foldLbsPerFolderMinute} lb/min/person`}
            </SummaryRow>
            <Separator />
            <SummaryRow label="Effective folders">
              {shift === null
                ? "No active shift"
                : `${shift.effectiveFolderCount} employees`}
            </SummaryRow>
            <Separator />
            <SummaryRow label="Pulse capacity">
              {pulseCapacity === null
                ? "Available with a published pulse and active shift"
                : `${pulseCapacity} lb folding ceiling`}
            </SummaryRow>
          </dl>
        </CardContent>
      </Card>
      <AppearanceSettings theme={theme} onThemeChange={onThemeChange} />
    </div>
  )
}
