import {
  IconAlertTriangle,
  IconArrowRight,
  IconCalendarEvent,
  IconCalendarStats,
  IconRefresh,
} from "@tabler/icons-react"
import { enUS, es } from "date-fns/locale"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { ProductionRemainingDayForecast } from "@pressly/contracts/production"
import {
  MetricStrip,
  SectionHeading,
} from "@/components/layout/workspace-primitives"
import { OperationalOrderIdentity } from "@/components/orders/operational-order-identity"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import type { RemainingDayForecastModel } from "./forecast.model"
import {
  forecastActionLabelKey,
  forecastItemStateKey,
  forecastNavigationTarget,
  formatForecastClock,
  formatForecastDateTime,
  localeForLanguage,
  type ForecastItem,
  type ForecastNavigationTarget,
} from "./forecast.presenter"

type ForecastGroup = Readonly<{
  id: "inProduction" | "readyToPlace" | "expectedLater" | "needsShift"
  items: readonly ForecastItem[]
  summary: ProductionRemainingDayForecast["totals"]["all"]
}>

const serviceDayToDate = (serviceDay: string): Date | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(serviceDay)
  if (match === null) return undefined
  const [, year, month, day] = match
  const value = new Date(Number(year), Number(month) - 1, Number(day), 12)
  return value.getFullYear() === Number(year) &&
    value.getMonth() === Number(month) - 1 &&
    value.getDate() === Number(day)
    ? value
    : undefined
}

const dateToServiceDay = (value: Date): string =>
  [
    String(value.getFullYear()).padStart(4, "0"),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-")

const formatServiceDay = (serviceDay: string, locale: string): string => {
  const value = serviceDayToDate(serviceDay)
  return value === undefined
    ? serviceDay
    : new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(value)
}

const assumptionKeys = [
  "forecast.assumptions.algorithm",
  "forecast.assumptions.overdue",
  "forecast.assumptions.intake",
  "forecast.assumptions.wholeOrders",
  "forecast.assumptions.weights",
  "forecast.assumptions.missingEstimates",
  "forecast.assumptions.revalidation",
  "forecast.assumptions.noPreciseFinish",
] as const

function ForecastLoading() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4" aria-label={t("forecast.loading")}>
      <Skeleton className="h-16 w-full" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-56" />
        ))}
      </div>
    </div>
  )
}

function ForecastItemRow({
  item,
  timezone,
  locale,
  onNavigate,
  canNavigate,
}: Readonly<{
  item: ForecastItem
  timezone: string
  locale: string
  onNavigate: (target: ForecastNavigationTarget) => void
  canNavigate: (target: ForecastNavigationTarget) => boolean
}>) {
  const { t } = useTranslation()
  const target = forecastNavigationTarget(item)
  const actionLabelKey = forecastActionLabelKey(item)

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <OperationalOrderIdentity
            identity={item.identity}
            className="me-auto"
          />
          {item.priority && <Badge>{t("forecast.priority")}</Badge>}
          <Badge variant="outline">{t(forecastItemStateKey(item))}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("forecast.due", {
            date: formatForecastDateTime(item.dueAt, timezone, locale),
          })}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {item.estimatedWeightLbs === null
            ? t("forecast.estimateMissing")
            : t("forecast.estimatedWeight", {
                weight: item.estimatedWeightLbs,
              })}
          {" · "}
          {item.bagCount === null
            ? t("forecast.bagsNotRecorded")
            : t("common.bags", { count: item.bagCount })}
        </p>
        {item.actionability.action === "monitor" && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t(`forecast.actionReason.${item.actionability.reason}`)}
          </p>
        )}
      </div>
      {target !== null && actionLabelKey !== null && canNavigate(target) && (
        <Button
          type="button"
          variant="outline"
          className="h-11 shrink-0 sm:self-center"
          onClick={() => onNavigate(target)}
        >
          {t(actionLabelKey)}
          <IconArrowRight data-icon="inline-end" />
        </Button>
      )}
    </li>
  )
}

function ForecastGroupCard({
  group,
  timezone,
  locale,
  onNavigate,
  canNavigate,
}: Readonly<{
  group: ForecastGroup
  timezone: string
  locale: string
  onNavigate: (target: ForecastNavigationTarget) => void
  canNavigate: (target: ForecastNavigationTarget) => boolean
}>) {
  const { t } = useTranslation()
  return (
    <Card className="min-w-0 bg-background">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-3">
          <CardTitle role="heading" aria-level={3}>
            {t(`forecast.groups.${group.id}.title`)}
          </CardTitle>
          <Badge variant="secondary">
            {t("common.orders", { count: group.summary.orderCount })}
          </Badge>
        </div>
        <CardDescription>
          {t(`forecast.groups.${group.id}.description`)}
        </CardDescription>
        <p className="pt-1 text-xs text-muted-foreground">
          {t("forecast.groupWeight", {
            weight: group.summary.knownWeightLbs,
            missing: group.summary.missingEstimateOrderCount,
          })}
        </p>
      </CardHeader>
      <CardContent>
        {group.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t(`forecast.groups.${group.id}.empty`)}
          </p>
        ) : (
          <ul className="divide-y">
            {group.items.map((item) => (
              <ForecastItemRow
                key={item.orderDemandId}
                item={item}
                timezone={timezone}
                locale={locale}
                onNavigate={onNavigate}
                canNavigate={canNavigate}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function ForecastDetails({
  forecast,
  locale,
}: Readonly<{
  forecast: ProductionRemainingDayForecast
  locale: string
}>) {
  const { t } = useTranslation()
  const capacityTone =
    forecast.capacityRisk.level === "attention"
      ? "secondary"
      : forecast.capacityRisk.level === "clear"
        ? "default"
        : "outline"

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="bg-background">
        <CardHeader>
          <CardTitle role="heading" aria-level={3}>
            {t("forecast.capacity.title")}
          </CardTitle>
          <CardDescription>
            {t("forecast.capacity.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={capacityTone}>
              {t(`forecast.capacity.level.${forecast.capacityRisk.level}`)}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {forecast.capacityRisk.pulseCapacityLbs === null
                ? t("forecast.capacity.unknownPulse")
                : t("forecast.capacity.pulse", {
                    weight: forecast.capacityRisk.pulseCapacityLbs,
                  })}
            </span>
          </div>
          <ul className="mt-4 list-disc space-y-1 ps-5 text-sm text-muted-foreground">
            {forecast.capacityRisk.reasons.map((reason) => (
              <li key={reason}>{t(`forecast.capacity.reason.${reason}`)}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="bg-background">
        <CardHeader>
          <CardTitle role="heading" aria-level={3}>
            {t("forecast.shifts.title")}
          </CardTitle>
          <CardDescription>{t("forecast.shifts.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {forecast.shifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("forecast.shifts.empty")}
            </p>
          ) : (
            <ul className="divide-y">
              {forecast.shifts.map((shift) => (
                <li
                  key={shift.productionShiftId}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <span className="text-sm">
                    {formatForecastClock(
                      shift.startsAt,
                      forecast.timezone,
                      locale
                    )}
                    {" – "}
                    {formatForecastClock(
                      shift.endsAt,
                      forecast.timezone,
                      locale
                    )}
                  </span>
                  <Badge variant="outline">
                    {t(`forecast.shifts.status.${shift.status}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function ForecastView({
  model,
  timezone,
  onNavigate,
  canNavigate = () => true,
}: Readonly<{
  model: RemainingDayForecastModel
  timezone: string
  onNavigate: (target: ForecastNavigationTarget) => void
  canNavigate?: (target: ForecastNavigationTarget) => boolean
}>) {
  const { t, i18n } = useTranslation()
  const locale = localeForLanguage(i18n.resolvedLanguage)
  const forecast = model.forecast
  const [calendarOpen, setCalendarOpen] = useState(false)
  const serviceDayLabel = formatServiceDay(model.serviceDay, locale)

  return (
    <div className="flex flex-col gap-5" data-testid="forecast-workspace">
      <SectionHeading
        title={t("forecast.workspaceTitle")}
        description={t("forecast.workspaceDescription")}
        action={
          <div className="flex flex-wrap items-end gap-2">
            <Field className="gap-1.5">
              <FieldLabel htmlFor="forecast-service-day" className="text-xs">
                {t("forecast.serviceDay")}
              </FieldLabel>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="forecast-service-day"
                    type="button"
                    variant="outline"
                    className="h-11 w-44 justify-start px-3 font-normal"
                    aria-label={t("forecast.serviceDayValue", {
                      date: serviceDayLabel,
                    })}
                  >
                    <IconCalendarEvent data-icon="inline-start" />
                    <span className="truncate">{serviceDayLabel}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  sideOffset={8}
                  collisionPadding={8}
                  className="w-auto max-w-[calc(100vw-1rem)] p-3"
                >
                  <Calendar
                    mode="single"
                    locale={i18n.resolvedLanguage === "es" ? es : enUS}
                    timeZone={timezone}
                    selected={serviceDayToDate(model.serviceDay)}
                    defaultMonth={serviceDayToDate(model.serviceDay)}
                    onSelect={(date) => {
                      if (date !== undefined) {
                        model.onServiceDayChange(dateToServiceDay(date))
                        setCalendarOpen(false)
                      }
                    }}
                    className="mx-auto w-fit max-w-full p-0 [--cell-size:--spacing(10)] sm:[--cell-size:--spacing(11)]"
                    classNames={{
                      month: "flex w-full flex-col gap-2",
                      week: "mt-1 flex w-full",
                    }}
                  />
                </PopoverContent>
              </Popover>
            </Field>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={model.refreshing || model.loading}
              onClick={() => void model.refresh()}
            >
              <IconRefresh
                data-icon="inline-start"
                className={model.refreshing ? "animate-spin" : undefined}
              />
              {t("common.refresh")}
            </Button>
          </div>
        }
      />

      {model.error !== null && (
        <Alert variant={forecast === null ? "destructive" : "default"}>
          <IconAlertTriangle />
          <AlertTitle>
            {forecast === null
              ? t("forecast.loadFailed")
              : t("forecast.refreshFailed")}
          </AlertTitle>
          <AlertDescription>{model.error}</AlertDescription>
        </Alert>
      )}

      {model.loading ? (
        <ForecastLoading />
      ) : forecast === null ? (
        <Card className="bg-background">
          <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
            <IconCalendarStats className="size-6 text-muted-foreground" />
            <p className="font-medium">{t("forecast.unavailableTitle")}</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {t("forecast.unavailableDescription")}
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => void model.refresh()}
            >
              {t("common.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              {t("forecast.window", {
                start: formatForecastDateTime(
                  forecast.window.startsAt,
                  forecast.timezone,
                  locale
                ),
                end: formatForecastDateTime(
                  forecast.window.endsAt,
                  forecast.timezone,
                  locale
                ),
                timezone: forecast.timezone,
              })}
            </p>
            <p>
              {t("forecast.updated", {
                date: formatForecastDateTime(
                  forecast.asOf,
                  forecast.timezone,
                  locale
                ),
              })}
            </p>
          </div>

          <MetricStrip
            label={t("forecast.summary")}
            metrics={[
              {
                label: t("forecast.groups.inProduction.title"),
                value: t("common.pounds", {
                  value: forecast.totals.inProduction.knownWeightLbs,
                }),
                detail: t("common.orders", {
                  count: forecast.totals.inProduction.orderCount,
                }),
              },
              {
                label: t("forecast.groups.readyToPlace.title"),
                value: t("common.pounds", {
                  value: forecast.totals.readyToPlace.knownWeightLbs,
                }),
                detail: t("common.orders", {
                  count: forecast.totals.readyToPlace.orderCount,
                }),
              },
              {
                label: t("forecast.groups.expectedLater.title"),
                value: t("common.pounds", {
                  value: forecast.totals.expectedLater.knownWeightLbs,
                }),
                detail: t("common.orders", {
                  count: forecast.totals.expectedLater.orderCount,
                }),
              },
              {
                label: t("forecast.groups.needsShift.title"),
                value: t("common.pounds", {
                  value: forecast.totals.needsShift.knownWeightLbs,
                }),
                detail: t("common.orders", {
                  count: forecast.totals.needsShift.orderCount,
                }),
              },
            ]}
          />

          <ForecastDetails forecast={forecast} locale={locale} />

          <div className="grid gap-4 lg:grid-cols-2">
            {(
              [
                {
                  id: "inProduction",
                  items: forecast.groups.inProduction,
                  summary: forecast.totals.inProduction,
                },
                {
                  id: "readyToPlace",
                  items: forecast.groups.readyToPlace,
                  summary: forecast.totals.readyToPlace,
                },
                {
                  id: "expectedLater",
                  items: forecast.groups.expectedLater,
                  summary: forecast.totals.expectedLater,
                },
                {
                  id: "needsShift",
                  items: forecast.groups.needsShift,
                  summary: forecast.totals.needsShift,
                },
              ] satisfies readonly ForecastGroup[]
            ).map((group) => (
              <ForecastGroupCard
                key={group.id}
                group={group}
                timezone={forecast.timezone}
                locale={locale}
                onNavigate={onNavigate}
                canNavigate={canNavigate}
              />
            ))}
          </div>

          <Card className="bg-background">
            <CardContent>
              <Accordion type="single" collapsible>
                <AccordionItem value="assumptions" className="border-0">
                  <AccordionTrigger>
                    {t("forecast.assumptions.title")}
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="list-disc space-y-1 ps-5 text-muted-foreground">
                      {assumptionKeys.map((key) => (
                        <li key={key}>{t(key)}</li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
