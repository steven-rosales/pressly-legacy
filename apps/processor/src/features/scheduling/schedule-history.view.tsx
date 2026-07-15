import {
  IconCalendarPlus,
  IconHistory,
  IconLayoutBoard,
} from "@tabler/icons-react"
import type { ProductionRunSummary, ProductionShift } from "@pressly/contracts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

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
  timezone: string
): string => {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  }).format(new Date(shift.startsAt))
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  })
  return `${date} · ${time.format(new Date(shift.startsAt))}–${time.format(
    new Date(shift.endsAt)
  )}`
}

const historyCopy = (
  input: Pick<ScheduleHistoryViewProps, "reason" | "productionRun">
) => {
  if (input.productionRun?.status === "started")
    return {
      title: "Production is already running",
      description:
        "This shift already owns a production run. Continue floor work from the production board.",
      badge: "In production",
    }
  if (input.productionRun?.status === "completed")
    return {
      title: "This shift is complete",
      description:
        "Its accepted plan and production record are preserved. Start the waiting orders in a new shift.",
      badge: "Completed",
    }
  if (input.reason === "closed")
    return {
      title: "This shift is closed",
      description:
        "Closed shifts are read-only. Plan a new shift for the waiting orders.",
      badge: "Closed",
    }
  return {
    title: "This shift has ended",
    description:
      "It can no longer be computed, accepted, or started. Plan a new shift for the waiting orders.",
    badge: "Ended",
  }
}

export function ScheduleHistoryView(input: ScheduleHistoryViewProps) {
  const copy = historyCopy(input)
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
              {formatShiftWindow(input.shift, input.timezone)}
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
                ? "Open production history"
                : "Open production"}
            </Button>
          )}
          {!productionRunning && (
            <Button
              type="button"
              className="h-11"
              onClick={input.onPlanNewShift}
            >
              <IconCalendarPlus data-icon="inline-start" />
              Plan a new shift
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
