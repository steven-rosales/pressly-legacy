import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconPlayerPlay,
  IconRefresh,
  IconSparkles,
} from "@tabler/icons-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { MetricStrip } from "@/components/layout/workspace-primitives"
import { OperationalOrderIdentity } from "@/components/orders/operational-order-identity"
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
  localeForLanguage,
  presentSchedulingDueBucket,
  presentScheduleLifecycle,
  presentScheduleWarning,
  summarizeScheduleDemand,
  zonedDateTimeInputToIso,
} from "./scheduling.presenter"

const stageLabels = {
  sorting: "common.stage.sorting",
  washing: "common.stage.washing",
  drying: "common.stage.drying",
  folding_packaging: "common.stage.foldingPackaging",
} as const

const formatClock = (value: string, timeZone: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, {
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

export function SchedulingWorkspace(
  input: SchedulingModelInput &
    Readonly<{
      remainingDayContext?: ReactNode
    }>
) {
  const { t, i18n } = useTranslation()
  const locale = localeForLanguage(i18n.resolvedLanguage)
  const model = useSchedulingModel(input)
  const metricProposal = model.planDirty ? null : model.proposal
  const demand = summarizeScheduleDemand(model.proposal, model.selectedOrders)
  const demandLabel =
    model.planDirty && model.proposal !== null
      ? t("scheduling.previousPlanDemand")
      : demand.label === "Planned demand"
        ? t("scheduling.plannedDemand")
        : t("scheduling.selectedDemand")
  const timelinePulseMinutes =
    model.proposal?.pulseMinutes ?? model.pulseMinutes
  const lifecycle = presentScheduleLifecycle({
    proposal: model.proposal,
    dirty: model.planDirty,
    configurationReady: model.configurationReady,
  })
  const lifecycleCopy =
    lifecycle.state === "configuration_required"
      ? {
          badge: t("scheduling.setupRequired"),
          title: t("scheduling.publishConfiguration"),
          description: t("scheduling.configurationDescription"),
          actionLabel: t("scheduling.openConfiguration"),
        }
      : lifecycle.action === "generate" && model.selectedOrderCount === 0
        ? {
            badge: t("scheduling.selectionRequired"),
            title: t("scheduling.selectShiftOrders"),
            description: t("scheduling.selectShiftOrdersDescription"),
            actionLabel: t("scheduling.computeSchedule"),
          }
        : lifecycle.state === "dirty"
          ? {
              badge: t("scheduling.changesNotComputed"),
              title: t("scheduling.recomputePlan"),
              description: t("scheduling.recomputeDescription"),
              actionLabel: t("scheduling.recomputeSchedule"),
            }
          : lifecycle.state === "accepted"
            ? {
                badge: t("scheduling.planAccepted"),
                title: t("scheduling.readyToStart"),
                description: t("scheduling.startDescription"),
                actionLabel: t("scheduling.startRun"),
              }
            : lifecycle.state === "draft"
              ? {
                  badge: t("scheduling.reviewPlan"),
                  title: t("scheduling.acceptExactProposal"),
                  description: t("scheduling.acceptDescription"),
                  actionLabel: t("scheduling.acceptPlan"),
                }
              : {
                  badge: t("scheduling.readyToCompute"),
                  title: t("scheduling.buildShiftPlan"),
                  description: t("scheduling.buildDescription"),
                  actionLabel: t("scheduling.computeSchedule"),
                }
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
      value: t("common.pounds", { value: demand.derivedWeightLbs }),
      detail:
        t("scheduling.wholeOrders", { count: demand.orderCount }) +
        " · " +
        t("common.bags", { count: demand.bagCount }),
    },
    {
      label: t("scheduling.pulseCapacity"),
      value:
        metricProposal === null
          ? "—"
          : t("common.pounds", { value: metricProposal.pulseCapacityLbs }),
      detail: model.planDirty
        ? t("scheduling.recomputeCapacity")
        : t("scheduling.productionPulse", {
            minutes: metricProposal?.pulseMinutes ?? model.pulseMinutes,
          }),
    },
    {
      label: t("scheduling.makespan"),
      value:
        metricProposal === null
          ? "—"
          : t("common.minutesShort", {
              minutes: metricProposal.makespanMinutes,
            }),
      detail: model.planDirty
        ? t("scheduling.recomputeTimeline")
        : t("scheduling.sortingThroughPackaging"),
    },
    {
      label: t("scheduling.forecastFinish"),
      value: metricProposal
        ? formatClock(
            metricProposal.plannedCompletionAt,
            input.defaults.timezone,
            locale
          )
        : "—",
      detail: model.planDirty
        ? t("scheduling.recomputeForecast")
        : metricProposal === null
          ? t("scheduling.awaitingProposal")
          : overflowMinutes > 0
            ? t("scheduling.afterShift", { minutes: overflowMinutes })
            : t("scheduling.withinShift"),
    },
  ] as const
  const actionDisabled =
    model.busy !== null ||
    model.selectionBusy ||
    (lifecycle.action !== "configure" && !input.canManage) ||
    (lifecycle.action === "configure" && input.onOpenConfiguration == null) ||
    (lifecycle.action === "accept" &&
      model.blockingWarnings.length > 0 &&
      !model.acknowledged) ||
    (lifecycle.action === "generate" &&
      (model.selectedOrderCount === 0 || model.staleSelectedOrderCount > 0))
  const actionLabel =
    model.busy === "generate"
      ? t("scheduling.computing")
      : model.busy === "accept"
        ? t("scheduling.accepting")
        : model.busy === "start"
          ? t("scheduling.starting")
          : lifecycleCopy.actionLabel

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
          <AlertTitle>{t("scheduling.actionFailed")}</AlertTitle>
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
                <p className="font-semibold">{lifecycleCopy.title}</p>
                <Badge
                  variant={
                    lifecycle.state === "accepted" ? "default" : "secondary"
                  }
                >
                  {lifecycleCopy.badge}
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {lifecycleCopy.description}
              </p>
              {!input.canManage && lifecycle.action !== "configure" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("scheduling.managerRequired")}
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
                disabled={
                  model.busy !== null || model.selectionBusy || !input.canManage
                }
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
                aria-label={t("scheduling.blockingWarnings")}
                tabIndex={0}
                className="max-h-[min(9rem,30vh)] overflow-y-auto overscroll-contain rounded-lg focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex flex-col gap-2 pe-1">
                  {model.blockingWarnings.map((warning) => {
                    const copy = presentScheduleWarning(warning, t)
                    return (
                      <Alert
                        key={warning.code}
                        className="border-warning-foreground/20 bg-warning text-warning-foreground"
                      >
                        <IconAlertTriangle />
                        <AlertTitle>{copy.title}</AlertTitle>
                        <AlertDescription>{copy.detail}</AlertDescription>
                      </Alert>
                    )
                  })}
                </div>
              </div>
              {model.accepted ? (
                <p
                  className="flex items-center gap-2 text-sm font-medium text-success-foreground [&_svg]:size-4"
                  role="status"
                >
                  <IconCheck /> {t("scheduling.warningsAcknowledged")}
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
                    {t("scheduling.acknowledgeWarnings")}
                  </FieldLabel>
                </Field>
              )}
            </div>
          )}
      </Card>

      <MetricStrip label={t("scheduling.summary")} metrics={metrics} />

      {input.remainingDayContext}

      <Card className="min-w-0 bg-background">
        <Tabs defaultValue="proposal">
          <CardHeader className="border-b pb-0">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <CardTitle>
                  {model.planDirty
                    ? t("scheduling.previousTimeline")
                    : t("scheduling.timelineTitle")}
                </CardTitle>
                <CardDescription className="mt-1">
                  {t("scheduling.timelineDescription", {
                    minutes: timelinePulseMinutes,
                  })}
                </CardDescription>
              </div>
              <TabsList variant="line">
                <TabsTrigger value="proposal">
                  {t("scheduling.timeline")}
                </TabsTrigger>
                <TabsTrigger value="orders">
                  {t("scheduling.orders")} · {model.selectedOrderCount}/
                  {model.orders.length}
                </TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>
          <TabsContent value="proposal">
            <CardContent className="pt-4">
              {model.proposal === null ? (
                <div className="grid min-h-64 place-items-center rounded-xl border border-dashed p-8 text-center">
                  <div>
                    <IconSparkles className="mx-auto text-muted-foreground" />
                    <p className="mt-3 font-medium">{t("scheduling.noPlan")}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("scheduling.noPlanDescription")}
                    </p>
                  </div>
                </div>
              ) : model.proposal.batches.length === 0 ? (
                <div className="grid min-h-52 place-items-center rounded-xl border border-dashed p-8 text-center">
                  <div>
                    <p className="font-medium">
                      {t("scheduling.noEligibleWork")}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("scheduling.noBatches")}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto pb-2">
                  <div className="flex min-w-[820px] flex-col gap-3">
                    <div className="grid grid-cols-[96px_repeat(4,minmax(150px,1fr))] gap-2 px-1 text-sm font-medium text-muted-foreground">
                      <span>{t("scheduling.batch")}</span>
                      {Object.values(stageLabels).map((label) => (
                        <span key={label}>{t(label)}</span>
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
                            {t("scheduling.batchDetail", {
                              weight: batch.derivedWeightLbs,
                              bags: t("common.bags", { count: batch.bagCount }),
                            })}
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
                                input.defaults.timezone,
                                locale
                              )}
                              –
                              {formatClock(
                                stage.endsAt,
                                input.defaults.timezone,
                                locale
                              )}
                            </div>
                            <p className="mt-2 truncate text-sm text-muted-foreground">
                              {stage.machineIds.length > 0
                                ? t("scheduling.machines", {
                                    count: stage.machineIds.length,
                                  })
                                : t("scheduling.teamStation")}
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
            <CardContent className="pt-0">
              <div className="flex flex-col gap-3 border-b py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">
                    {t("scheduling.readyOrdersForShift")}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {t("scheduling.selectionSummary", {
                      selected: model.selectedOrderCount,
                      total: model.orders.length,
                      weight: model.selectedWeightLbs,
                    })}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("scheduling.selectionEligibility")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      !input.canManage ||
                      model.selectionBusy ||
                      model.busy !== null ||
                      model.orders.length === 0 ||
                      model.selectedOrderCount === model.orders.length
                    }
                    onClick={() => void model.selectAllReady()}
                  >
                    {t("scheduling.selectAllReady")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={
                      !input.canManage ||
                      model.selectionBusy ||
                      model.busy !== null ||
                      (model.selectedOrderIds.size === 0 &&
                        model.staleSelectedOrderCount === 0)
                    }
                    onClick={() => void model.clearSelection()}
                  >
                    {t("scheduling.clearSelection")}
                  </Button>
                </div>
              </div>
              {model.staleSelectedOrderCount > 0 && (
                <Alert
                  className="mt-3 border-warning-foreground/20 bg-warning text-warning-foreground"
                  role="status"
                >
                  <IconAlertTriangle />
                  <AlertTitle>
                    {t("scheduling.selectionNeedsReview")}
                  </AlertTitle>
                  <AlertDescription>
                    {t("scheduling.staleSelection", {
                      count: model.staleSelectedOrderCount,
                    })}
                  </AlertDescription>
                </Alert>
              )}
              {model.orders.length === 0 ? (
                <div className="grid min-h-52 place-items-center text-center">
                  <div>
                    <p className="font-medium">
                      {t("scheduling.noEligibleOrders")}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("scheduling.demandRemains")}
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
                      <Checkbox
                        id={`schedule-order-${order.id}`}
                        checked={model.selectedOrderIds.has(order.id)}
                        disabled={
                          model.busy !== null ||
                          model.selectionBusy ||
                          !input.canManage
                        }
                        onCheckedChange={(checked) =>
                          void model.toggleSelection(order.id, checked === true)
                        }
                        aria-label={t("scheduling.selectOrder", {
                          orderId: order.identity.displayNumber,
                        })}
                      />
                      <div className="min-w-0 flex-1">
                        <OperationalOrderIdentity identity={order.identity} />
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("scheduling.orderDetail", {
                            weight: order.derivedWeightLbs,
                            bags: t("common.bags", { count: order.bagCount }),
                            due: presentSchedulingDueBucket(order.dueBucket, t),
                          })}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {presentSchedulingDueBucket(order.dueBucket, t)}
                      </Badge>
                      <span className="text-sm font-medium text-muted-foreground">
                        {t("scheduling.priority")}
                      </span>
                      <Switch
                        checked={model.priorityIds.has(order.id)}
                        disabled={
                          model.busy !== null ||
                          model.selectionBusy ||
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
                        aria-label={t("scheduling.prioritizeOrder", {
                          orderId: order.identity.displayNumber,
                        })}
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
