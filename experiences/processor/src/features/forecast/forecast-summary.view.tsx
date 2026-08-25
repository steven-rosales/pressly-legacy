import {
  IconAlertTriangle,
  IconArrowRight,
  IconCalendarStats,
} from "@tabler/icons-react"
import { useTranslation } from "react-i18next"
import { Badge } from "../../browser/components/ui/badge"
import { Button } from "../../browser/components/ui/button"
import { Card, CardContent } from "../../browser/components/ui/card"
import { Skeleton } from "../../browser/components/ui/skeleton"
import type { RemainingDayForecastModel } from "./forecast.model"
import { formatForecastDateTime, localeForLanguage } from "./forecast.presenter"

export function ForecastSummaryView({
  model,
  variant,
  onOpenForecast,
}: Readonly<{
  model: RemainingDayForecastModel
  variant: "home" | "schedule"
  onOpenForecast: () => void
}>) {
  const { t, i18n } = useTranslation()
  const forecast = model.forecast
  const locale = localeForLanguage(i18n.resolvedLanguage)

  if (model.loading)
    return (
      <Skeleton
        className={variant === "home" ? "h-24 w-full" : "h-16 w-full"}
        role="status"
        aria-label={t("forecast.loadingSummary")}
      />
    )

  if (forecast === null)
    return (
      <Card
        size="sm"
        className="bg-background"
        data-testid={`forecast-summary-${variant}`}
      >
        <CardContent className="flex min-h-16 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2">
            <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">{t("forecast.summaryUnavailable")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {model.error ?? t("forecast.errors.loadFailed")}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-11 shrink-0"
            onClick={() => void model.refresh()}
          >
            {t("common.retry")}
          </Button>
        </CardContent>
      </Card>
    )

  return (
    <Card
      size="sm"
      className="bg-background"
      data-testid={`forecast-summary-${variant}`}
    >
      <CardContent
        className={
          variant === "home"
            ? "flex flex-col gap-4 lg:flex-row lg:items-center"
            : "flex flex-col gap-3 sm:flex-row sm:items-center"
        }
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted [&_svg]:size-4"
            aria-hidden="true"
          >
            <IconCalendarStats />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{t("forecast.summaryTitle")}</p>
              <Badge
                variant={
                  forecast.capacityRisk.level === "attention"
                    ? "secondary"
                    : "outline"
                }
              >
                {t(`forecast.capacity.level.${forecast.capacityRisk.level}`)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {variant === "home"
                ? [
                    t("forecast.homeSummary", {
                      orders: forecast.totals.all.orderCount,
                      weight: forecast.totals.all.knownWeightLbs,
                    }),
                    forecast.totals.all.missingEstimateOrderCount > 0
                      ? t("forecast.missingEstimateSummary", {
                          count: forecast.totals.all.missingEstimateOrderCount,
                        })
                      : null,
                  ]
                    .filter((value) => value !== null)
                    .join(" · ")
                : t("forecast.scheduleSummary", {
                    ready: forecast.totals.readyToPlace.orderCount,
                    needsShift: forecast.totals.needsShift.orderCount,
                  })}
            </p>
            {model.error !== null && (
              <p
                role="status"
                className="mt-1 flex items-start gap-1 text-xs text-warning-foreground"
              >
                <IconAlertTriangle
                  className="mt-0.5 size-3 shrink-0"
                  aria-hidden="true"
                />
                {t("forecast.staleSummary", {
                  date: formatForecastDateTime(
                    forecast.asOf,
                    forecast.timezone,
                    locale
                  ),
                })}
              </p>
            )}
          </div>
        </div>

        {variant === "home" && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("forecast.groups.inProduction.title")}
              </dt>
              <dd className="font-medium tabular-nums">
                {forecast.totals.inProduction.orderCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("forecast.groups.readyToPlace.title")}
              </dt>
              <dd className="font-medium tabular-nums">
                {forecast.totals.readyToPlace.orderCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("forecast.groups.expectedLater.title")}
              </dt>
              <dd className="font-medium tabular-nums">
                {forecast.totals.expectedLater.orderCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("forecast.groups.needsShift.title")}
              </dt>
              <dd className="font-medium tabular-nums">
                {forecast.totals.needsShift.orderCount}
              </dd>
            </div>
          </dl>
        )}

        <Button
          type="button"
          variant="outline"
          className="h-11 shrink-0"
          onClick={onOpenForecast}
        >
          {t("forecast.openForecast")}
          <IconArrowRight data-icon="inline-end" />
        </Button>
      </CardContent>
    </Card>
  )
}
