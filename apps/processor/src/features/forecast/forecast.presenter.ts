import type {
  ProcessorForecastExpectedLaterItem,
  ProcessorForecastInProductionItem,
  ProcessorForecastNeedsShiftItem,
  ProcessorForecastReadyToPlaceItem,
} from "@pressly/contracts/processor"

export type ForecastItem =
  | ProcessorForecastInProductionItem
  | ProcessorForecastReadyToPlaceItem
  | ProcessorForecastExpectedLaterItem
  | ProcessorForecastNeedsShiftItem

export type ForecastNavigationTarget =
  | Readonly<{ view: "intake" }>
  | Readonly<{ view: "production"; runId: string }>
  | Readonly<{ view: "schedule" }>

export const localeForLanguage = (
  language: string | undefined
): "en-US" | "es-US" =>
  language?.startsWith("es") === true ? "es-US" : "en-US"

export const serviceDayAt = (instant: Date, timezone: string): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value
  return `${part("year")}-${part("month")}-${part("day")}`
}

export const formatForecastDateTime = (
  value: string,
  timezone: string,
  locale: string
): string =>
  new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))

export const formatForecastClock = (
  value: string,
  timezone: string,
  locale: string
): string =>
  new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))

export const forecastActionLabelKey = (
  item: ForecastItem
):
  | "forecast.actions.openProduction"
  | "forecast.actions.recordIntake"
  | "forecast.actions.releaseToProduction"
  | "forecast.actions.placeInActiveRun"
  | "forecast.actions.reviewPlacement"
  | "forecast.actions.planShift"
  | null => {
  switch (item.actionability.action) {
    case "monitor":
      return null
    case "open_production":
      return "forecast.actions.openProduction"
    case "record_intake":
      return "forecast.actions.recordIntake"
    case "release_to_production":
      return "forecast.actions.releaseToProduction"
    case "place_in_active_run":
      return "forecast.actions.placeInActiveRun"
    case "review_placement":
      return "forecast.actions.reviewPlacement"
    case "plan_shift":
      return "forecast.actions.planShift"
  }
}

export const forecastNavigationTarget = (
  item: ForecastItem
): ForecastNavigationTarget | null => {
  switch (item.actionability.action) {
    case "monitor":
      return null
    case "record_intake":
    case "release_to_production":
      return { view: "intake" }
    case "plan_shift":
      return { view: "schedule" }
    case "open_production":
    case "place_in_active_run":
    case "review_placement":
      return "activeRunId" in item && item.activeRunId !== null
        ? { view: "production", runId: item.activeRunId }
        : null
  }
}

export const forecastItemStateKey = (
  item: ForecastItem
):
  | `forecast.itemState.${ProcessorForecastExpectedLaterItem["readiness"]}`
  | `forecast.itemState.${ProcessorForecastNeedsShiftItem["reason"]}`
  | "forecast.itemState.inProduction"
  | "forecast.itemState.readyToPlace" => {
  if ("readiness" in item) return `forecast.itemState.${item.readiness}`
  if ("reason" in item) return `forecast.itemState.${item.reason}`
  if ("activeBatchId" in item) return "forecast.itemState.inProduction"
  return "forecast.itemState.readyToPlace"
}
