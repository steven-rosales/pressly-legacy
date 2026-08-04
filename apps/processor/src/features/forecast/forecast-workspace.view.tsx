import type { ProductionPort } from "@/ports/production.port"
import type { Clock } from "@pressly/time"
import { useRemainingDayForecastModel } from "./forecast.model"
import type { ForecastNavigationTarget } from "./forecast.presenter"
import { ForecastSummaryView } from "./forecast-summary.view"
import { ForecastView } from "./forecast.view"

export function ForecastWorkspaceContainer({
  production,
  locationId,
  timezone,
  revision,
  now,
  variant,
  onNavigate,
  canNavigate,
  onOpenForecast,
}: Readonly<{
  production: ProductionPort
  locationId: string
  timezone: string
  revision: string
  now: Clock["now"]
  variant: "full" | "home" | "schedule"
  onNavigate: (target: ForecastNavigationTarget) => void
  canNavigate?: (target: ForecastNavigationTarget) => boolean
  onOpenForecast: () => void
}>) {
  const model = useRemainingDayForecastModel({
    production,
    locationId,
    timezone,
    revision,
    now,
  })

  return variant === "full" ? (
    <ForecastView
      model={model}
      timezone={timezone}
      onNavigate={onNavigate}
      canNavigate={canNavigate}
    />
  ) : (
    <ForecastSummaryView
      model={model}
      variant={variant}
      onOpenForecast={onOpenForecast}
    />
  )
}
