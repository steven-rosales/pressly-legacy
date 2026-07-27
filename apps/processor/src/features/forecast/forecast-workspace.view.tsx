import type { ProductionPort } from "@/ports/production.port"
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
  onOpenForecast,
}: Readonly<{
  production: ProductionPort
  locationId: string
  timezone: string
  revision: string
  now: () => Date
  variant: "full" | "home" | "schedule"
  onNavigate: (target: ForecastNavigationTarget) => void
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
    <ForecastView model={model} timezone={timezone} onNavigate={onNavigate} />
  ) : (
    <ForecastSummaryView
      model={model}
      variant={variant}
      onOpenForecast={onOpenForecast}
    />
  )
}
