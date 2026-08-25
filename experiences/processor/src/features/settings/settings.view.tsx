import type { ReactNode } from "react"
import type {
  ProductionShift,
  SchedulerConfig,
} from "@pressly/production-system/contracts/read-models/production-schedule"
import { useTranslation } from "react-i18next"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../browser/components/ui/card"
import { Separator } from "../../browser/components/ui/separator"
import type { IdempotencyPort } from "../../capabilities/idempotency.port"
import type { ProductionPort } from "../../capabilities/production.port"
import { AppearanceSettings } from "./appearance-settings.view"
import { LanguageSettings } from "./language-settings.view"
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
  const { t } = useTranslation()
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
              {t("settings.publishedPulse")}
            </CardTitle>
            <CardDescription>
              {schedulerConfig === null
                ? t("settings.notConfigured")
                : t("settings.immutableVersion", {
                    version: schedulerConfig.version,
                  })}
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
          <dl className="flex flex-col" aria-label={t("settings.pulseSummary")}>
            <SummaryRow label={t("settings.pulseDuration")}>
              {schedulerConfig === null
                ? t("settings.notPublished")
                : t("common.minutes", {
                    count: schedulerConfig.pulseMinutes,
                  })}
            </SummaryRow>
            <Separator />
            <SummaryRow label={t("settings.foldingRate")}>
              {schedulerConfig === null
                ? t("settings.notPublished")
                : t("settings.foldingRateValue", {
                    value: schedulerConfig.foldLbsPerFolderMinute,
                  })}
            </SummaryRow>
            <Separator />
            <SummaryRow label={t("settings.effectiveFolders")}>
              {shift === null
                ? t("settings.noActiveShift")
                : t("common.employees", {
                    count: shift.effectiveFolderCount,
                  })}
            </SummaryRow>
            <Separator />
            <SummaryRow label={t("settings.pulseCapacity")}>
              {pulseCapacity === null
                ? t("settings.capacityUnavailable")
                : t("settings.foldingCeiling", { value: pulseCapacity })}
            </SummaryRow>
          </dl>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-4">
        <LanguageSettings />
        <AppearanceSettings theme={theme} onThemeChange={onThemeChange} />
      </div>
    </div>
  )
}
