import {
  IconCalendarPlus,
  IconHistory,
  IconLayoutBoard,
} from "@tabler/icons-react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import type { ProductionRunSummary, ProductionShift } from "@pressly/contracts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { localeForLanguage } from "./scheduling.presenter"

type ScheduleHistoryViewProps = Readonly<{
  shift: ProductionShift
  productionRun: ProductionRunSummary | null
  reason: "run_owned" | "closed" | "expired"
  timezone: string
  onPlanNewShift: () => void
  onOpenProduction: (() => void) | null
}>

const formatShiftWindow = (
  shift: ProductionShift,
  timezone: string,
  locale: string
): string => {
  const date = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  }).format(new Date(shift.startsAt))
  const time = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  })
  return `${date} · ${time.format(new Date(shift.startsAt))}–${time.format(
    new Date(shift.endsAt)
  )}`
}

const historyCopy = (
  input: Pick<ScheduleHistoryViewProps, "reason" | "productionRun">,
  t: TFunction
) => {
  if (input.productionRun?.status === "started")
    return {
      title: t("scheduleHistory.runningTitle"),
      description: t("scheduleHistory.runningDescription"),
      badge: t("scheduleHistory.inProduction"),
    }
  if (input.productionRun?.status === "completed")
    return {
      title: t("scheduleHistory.completeTitle"),
      description: t("scheduleHistory.completeDescription"),
      badge: t("scheduleHistory.completed"),
    }
  if (input.reason === "closed")
    return {
      title: t("scheduleHistory.closedTitle"),
      description: t("scheduleHistory.closedDescription"),
      badge: t("scheduleHistory.closed"),
    }
  return {
    title: t("scheduleHistory.endedTitle"),
    description: t("scheduleHistory.endedDescription"),
    badge: t("scheduleHistory.ended"),
  }
}

export function ScheduleHistoryView(input: ScheduleHistoryViewProps) {
  const { t, i18n } = useTranslation()
  const copy = historyCopy(input, t)
  const productionRunning = input.productionRun?.status === "started"
  return (
    <Card className="bg-background py-0" data-testid="schedule-history">
      <CardContent className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground [&_svg]:size-4"
            aria-hidden="true"
          >
            <IconHistory />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{copy.title}</p>
              <Badge variant="secondary">{copy.badge}</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {copy.description}
            </p>
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              {formatShiftWindow(
                input.shift,
                input.timezone,
                localeForLanguage(i18n.resolvedLanguage)
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {input.onOpenProduction !== null && (
            <Button
              type="button"
              variant={productionRunning ? "default" : "outline"}
              className="h-11"
              onClick={input.onOpenProduction}
            >
              <IconLayoutBoard data-icon="inline-start" />
              {input.productionRun?.status === "completed"
                ? t("scheduleHistory.openHistory")
                : t("scheduleHistory.openProduction")}
            </Button>
          )}
          {!productionRunning && (
            <Button
              type="button"
              className="h-11"
              onClick={input.onPlanNewShift}
            >
              <IconCalendarPlus data-icon="inline-start" />
              {t("scheduleHistory.planNewShift")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
