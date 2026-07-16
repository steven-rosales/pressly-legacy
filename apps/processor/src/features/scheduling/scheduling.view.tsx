import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconPlayerPlay,
  IconRefresh,
  IconSparkles,
} from "@tabler/icons-react"
import { MetricStrip } from "@/components/layout/workspace-primitives"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/components/ui/class-names"
import { Field, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScheduleSettingsSheet } from "./schedule-settings-sheet.view"
import {
  useSchedulingModel,
  type SchedulingModelInput,
} from "./scheduling.model"
import {
  presentScheduleLifecycle,
  summarizeScheduleDemand,
  zonedDateTimeInputToIso,
} from "./scheduling.presenter"

const stageLabels = {
  sorting: "Sorting",
  washing: "Washing",
  drying: "Drying",
  folding_packaging: "Folding & packaging",
} as const

const formatClock = (value: string, timeZone: string): string =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value))

const windowMinutes = (
  start: string,
  end: string,
  timeZone: string
): number => {
  try {
    return Math.max(
      0,
      Math.round(
        (Date.parse(zonedDateTimeInputToIso(end, timeZone)) -
          Date.parse(zonedDateTimeInputToIso(start, timeZone))) /
          60_000
      )
    )
  } catch {
    return 0
  }
}

const pluralize = (count: number, singular: string) =>
  count + " " + singular + (count === 1 ? "" : "s")

export function SchedulingWorkspace(input: SchedulingModelInput) {
  const model = useSchedulingModel(input)
  const metricProposal = model.planDirty ? null : model.proposal
  const demand = summarizeScheduleDemand(model.proposal, model.orders)
  const demandLabel =
    model.planDirty && model.proposal !== null
      ? "Previous plan demand"
      : demand.label
  const timelinePulseMinutes =
    model.proposal?.pulseMinutes ?? model.pulseMinutes
  const lifecycle = presentScheduleLifecycle({
    proposal: model.proposal,
    dirty: model.planDirty,
    configurationReady: model.configurationReady,
  })
  const shiftMinutes = windowMinutes(
    model.shiftStartsAt,
    model.shiftEndsAt,
    input.defaults.timezone
  )
  const overflowMinutes = Math.max(
    0,
    (metricProposal?.makespanMinutes ?? 0) - shiftMinutes
  )
  const metrics = [
    {
      label: demandLabel,
      value: demand.derivedWeightLbs + " lb",
      detail:
        pluralize(demand.orderCount, "whole order") +
        " · " +
        pluralize(demand.bagCount, "bag"),
    },
    {
      label: "Pulse capacity",
      value:
        metricProposal === null ? "—" : metricProposal.pulseCapacityLbs + " lb",
      detail: model.planDirty
        ? "Recompute to refresh capacity"
        : (metricProposal?.pulseMinutes ?? model.pulseMinutes) +
          "-minute production pulse",
    },
    {
      label: "Makespan",
      value:
        metricProposal === null ? "—" : metricProposal.makespanMinutes + " min",
      detail: model.planDirty
        ? "Recompute to refresh timeline"
        : "Sorting through packaging",
    },
    {
      label: "Forecast finish",
      value: metricProposal
        ? formatClock(
            metricProposal.plannedCompletionAt,
            input.defaults.timezone
          )
        : "—",
      detail: model.planDirty
        ? "Recompute to refresh forecast"
        : metricProposal === null
          ? "Awaiting proposal"
          : overflowMinutes > 0
            ? overflowMinutes + " min after shift"
            : "Within the shift window",
    },
  ] as const
  const actionDisabled =
    model.busy !== null ||
    (lifecycle.action !== "configure" && !input.canManage) ||
    (lifecycle.action === "configure" && input.onOpenConfiguration == null) ||
    (lifecycle.action === "accept" &&
      model.blockingWarnings.length > 0 &&
      !model.acknowledged)
  const actionLabel =
    model.busy === "generate"
      ? "Computing…"
      : model.busy === "accept"
        ? "Accepting…"
        : model.busy === "start"
          ? "Starting…"
          : lifecycle.actionLabel

  const performPrimaryAction = () => {
    if (lifecycle.action === "configure") input.onOpenConfiguration?.()
    else if (lifecycle.action === "generate") void model.generate()
    else if (lifecycle.action === "accept") void model.accept()
    else void model.start()
  }

  return (
    <div className="flex flex-col gap-5">
      {model.error && (
        <Alert variant="destructive" role="alert">
          <IconAlertTriangle />
          <AlertTitle>Schedule action failed</AlertTitle>
          <AlertDescription>{model.error}</AlertDescription>
        </Alert>
      )}

      <Card
        className="py-0 md:sticky md:top-20 md:z-10 md:bg-background/95 md:backdrop-blur"
        data-testid="schedule-action-surface"
      >
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                "mt-0.5 grid size-9 shrink-0 place-items-center rounded-full [&_svg]:size-4",
                lifecycle.state === "accepted"
                  ? "bg-success text-success-foreground"
                  : lifecycle.state === "dirty" ||
                      lifecycle.state === "configuration_required"
                    ? "bg-warning text-warning-foreground"
                    : "bg-primary/10 text-primary"
              )}
              aria-hidden="true"
            >
              {lifecycle.state === "accepted" ? (
                <IconCheck />
              ) : lifecycle.state === "dirty" ? (
                <IconRefresh />
              ) : (
                <IconSparkles />
              )}
            </div>
            <div className="min-w-0" role="status" aria-live="polite">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{lifecycle.title}</p>
                <Badge
                  variant={
                    lifecycle.state === "accepted" ? "default" : "secondary"
                  }
                >
                  {lifecycle.badge}
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {lifecycle.description}
              </p>
              {!input.canManage && lifecycle.action !== "configure" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  An owner or administrator must advance this plan.
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            {model.configurationReady && (
              <ScheduleSettingsSheet
                mode={input.currentShift == null ? "create" : "edit"}
                pulseMinutes={model.pulseMinutes}
                foldRate={model.foldRate}
                configVersion={model.configVersion}
                timezone={input.defaults.timezone}
                settings={{
                  folders: model.folders,
                  shiftStartsAt: model.shiftStartsAt,
                  shiftEndsAt: model.shiftEndsAt,
                }}
                disabled={model.busy !== null || !input.canManage}
                error={model.settingsError}
                onApply={model.saveSettings}
              />
            )}
            <Button
              type="button"
              className="h-11 min-w-44"
              disabled={actionDisabled}
              onClick={performPrimaryAction}
            >
              {lifecycle.action === "start" ? (
                <IconPlayerPlay data-icon="inline-start" />
              ) : lifecycle.action === "generate" && model.planDirty ? (
                <IconRefresh data-icon="inline-start" />
              ) : lifecycle.action !== "configure" ? (
                <IconSparkles data-icon="inline-start" />
              ) : null}
              {actionLabel}
            </Button>
          </div>
        </CardContent>

        {model.proposal !== null &&
          !model.planDirty &&
          model.blockingWarnings.length > 0 && (
            <div className="flex flex-col gap-3 border-t px-4 py-3">
              <div
                role="region"
                aria-label="Blocking schedule warnings"
                tabIndex={0}
                className="max-h-[min(9rem,30vh)] overflow-y-auto overscroll-contain rounded-lg focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex flex-col gap-2 pe-1">
                  {model.blockingWarnings.map((warning) => (
                    <Alert
                      key={warning.code}
                      className="border-warning-foreground/20 bg-warning text-warning-foreground"
                    >
                      <IconAlertTriangle />
                      <AlertTitle>Shift overflow</AlertTitle>
                      <AlertDescription>{warning.message}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
              {model.accepted ? (
                <p
                  className="flex items-center gap-2 text-sm font-medium text-success-foreground [&_svg]:size-4"
                  role="status"
                >
                  <IconCheck /> Warnings acknowledged with the accepted plan.
                </p>
              ) : (
                <Field orientation="horizontal">
                  <Checkbox
                    id="acknowledge-warning"
                    checked={model.acknowledged}
                    onCheckedChange={(checked) =>
                      model.setAcknowledged(checked === true)
                    }
                  />
                  <FieldLabel
                    htmlFor="acknowledge-warning"
                    className="font-normal"
                  >
                    I acknowledge the blocking schedule warnings shown above.
                  </FieldLabel>
                </Field>
              )}
            </div>
          )}
      </Card>

      <MetricStrip label="Schedule summary" metrics={metrics} />

      <Card className="min-w-0 bg-background">
        <Tabs defaultValue="proposal">
          <CardHeader className="border-b pb-0">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <CardTitle>
                  {model.planDirty
                    ? "Previous production timeline"
                    : "Production timeline"}
                </CardTitle>
                <CardDescription className="mt-1">
                  Whole orders stay together through four equal{" "}
                  {timelinePulseMinutes}-minute stages.
                </CardDescription>
              </div>
              <TabsList variant="line">
                <TabsTrigger value="proposal">Timeline</TabsTrigger>
                <TabsTrigger value="orders">Orders</TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>
          <TabsContent value="proposal">
            <CardContent className="pt-4">
              {model.proposal === null ? (
                <div className="grid min-h-64 place-items-center rounded-xl border border-dashed p-8 text-center">
                  <div>
                    <IconSparkles className="mx-auto text-muted-foreground" />
                    <p className="mt-3 font-medium">No plan computed</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Compute the schedule above to build the production
                      timeline.
                    </p>
                  </div>
                </div>
              ) : model.proposal.batches.length === 0 ? (
                <div className="grid min-h-52 place-items-center rounded-xl border border-dashed p-8 text-center">
                  <div>
                    <p className="font-medium">No eligible work</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This proposal has no production batches.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto pb-2">
                  <div className="flex min-w-[820px] flex-col gap-3">
                    <div className="grid grid-cols-[96px_repeat(4,minmax(150px,1fr))] gap-2 px-1 text-sm font-medium text-muted-foreground">
                      <span>Batch</span>
                      {Object.values(stageLabels).map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>
                    {model.proposal.batches.map((batch) => (
                      <div
                        key={batch.sequence}
                        className="grid grid-cols-[96px_repeat(4,minmax(150px,1fr))] gap-2"
                      >
                        <div className="rounded-lg border bg-muted/40 p-3">
                          <p className="font-semibold">#{batch.sequence + 1}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {batch.derivedWeightLbs} lb · {batch.bagCount} bags
                          </p>
                        </div>
                        {batch.stages.map((stage) => (
                          <div
                            key={stage.stage}
                            className="rounded-lg border bg-background p-3"
                          >
                            <div className="flex items-center gap-1.5 text-sm font-medium [&_svg]:size-4">
                              <IconClock className="text-muted-foreground" />
                              {formatClock(
                                stage.startsAt,
                                input.defaults.timezone
                              )}
                              –
                              {formatClock(
                                stage.endsAt,
                                input.defaults.timezone
                              )}
                            </div>
                            <p className="mt-2 truncate text-sm text-muted-foreground">
                              {stage.machineIds.length > 0
                                ? pluralize(stage.machineIds.length, "machine")
                                : "Team station"}
                            </p>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </TabsContent>
          <TabsContent value="orders">
            <CardContent className="pt-1">
              {model.orders.length === 0 ? (
                <div className="grid min-h-52 place-items-center text-center">
                  <div>
                    <p className="font-medium">No currently eligible orders</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Planned demand remains visible in the timeline above.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y">
                  {model.orders.map((order) => (
                    <div
                      key={order.id}
                      className="flex min-h-14 items-center gap-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          Order {order.externalOrderId}
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {order.derivedWeightLbs} lb · {order.bagCount} bags ·
                          due {order.dueBucket}
                        </p>
                      </div>
                      <Badge variant="outline">{order.dueBucket}</Badge>
                      <span className="text-sm font-medium text-muted-foreground">
                        Priority
                      </span>
                      <Switch
                        checked={model.priorityIds.has(order.id)}
                        disabled={
                          model.busy !== null ||
                          model.pendingPriorityIds.has(order.id) ||
                          !input.canManage
                        }
                        onCheckedChange={(checked) =>
                          void model.togglePriority(
                            order.id,
                            order.version,
                            checked
                          )
                        }
                        aria-label={"Prioritize order " + order.externalOrderId}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  )
}
