import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCalendarPlus,
  IconCheck,
  IconClock,
  IconHistory,
  IconLock,
  IconLockOpen,
  IconListDetails,
  IconPlayerPlay,
  IconRefresh,
  IconScale,
  IconStack2,
} from "@tabler/icons-react"
import type { ProductionMachine, StageRun } from "@pressly/contracts"
import {
  MetricStrip,
  SectionHeading,
} from "@/components/layout/workspace-primitives"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/components/ui/class-names"
import { EarlyStageStartDialog } from "./early-stage-start-dialog.view"
import { BatchOrderInspector } from "./batch-order-inspector.view"
import { FloorProgressReconciliationSheet } from "./floor-progress-reconciliation.view"
import {
  useProductionBoardModel,
  type ProductionBoardModelInput,
} from "./production-board.model"
import {
  formatCountdown,
  formatMoment,
  formatStageWindow,
  localeForLanguage,
  presentStage,
  productionStages,
  selectDefaultStage,
  type ProductionStageKind,
  type StagePresentation,
} from "./production-board.presenter"

const mediaSnapshot = (query: string, fallback: boolean) => () =>
  typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches
    : fallback

const mediaSubscribe = (query: string) => (onStoreChange: () => void) => {
  if (typeof window.matchMedia !== "function") return () => undefined
  const media = window.matchMedia(query)
  media.addEventListener("change", onStoreChange)
  return () => media.removeEventListener("change", onStoreChange)
}

function useMediaQuery(query: string, fallback: boolean): boolean {
  return useSyncExternalStore(
    useMemo(() => mediaSubscribe(query), [query]),
    useMemo(() => mediaSnapshot(query, fallback), [fallback, query]),
    () => fallback
  )
}

const createBoardClock = (asOf: string) => {
  const receivedAt = performance.now()
  let elapsedSeconds = 0
  return {
    asOfMs: Date.parse(asOf),
    getSnapshot: () => elapsedSeconds,
    subscribe: (onStoreChange: () => void) => {
      const interval = window.setInterval(() => {
        const next = Math.floor((performance.now() - receivedAt) / 1_000)
        if (next === elapsedSeconds) return
        elapsedSeconds = next
        onStoreChange()
      }, 250)
      return () => window.clearInterval(interval)
    },
  }
}

function useBoardClock(asOf: string) {
  const clock = useMemo(() => createBoardClock(asOf), [asOf])
  const elapsedSeconds = useSyncExternalStore(
    clock.subscribe,
    clock.getSnapshot,
    () => 0
  )

  return clock.asOfMs + elapsedSeconds * 1_000
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  const positive =
    status === "completed" || status === "finished" || status === "accepted"
  const active =
    status === "started" ||
    ["sorting", "washing", "drying", "folding_packaging"].includes(status)
  return (
    <Badge
      variant="secondary"
      className={cn(
        positive && "bg-success text-success-foreground",
        active && "bg-foreground text-background"
      )}
    >
      {status === "completed" || status === "finished"
        ? t("production.completed")
        : status === "planned"
          ? t("production.planned")
          : status === "started"
            ? t("production.started")
            : status === "queued"
              ? t("common.queued")
              : status === "sorting"
                ? t("common.stage.sorting")
                : status === "washing"
                  ? t("common.stage.washing")
                  : status === "drying"
                    ? t("common.stage.drying")
                    : status === "folding_packaging"
                      ? t("common.stage.foldingPackaging")
                      : status.replaceAll("_", " ")}
    </Badge>
  )
}

function StageCard({
  stage,
  batchNumber,
  weight,
  orderCount,
  bagCount,
  pinned,
  presentation,
  now,
  mutationDisabled,
  busy,
  referenceAt,
  timezone,
  machines,
  onEditMachines,
  onAction,
}: {
  stage: StageRun
  batchNumber: number
  weight: number
  orderCount: number
  bagCount: number
  pinned: boolean
  presentation: StagePresentation
  now: number
  mutationDisabled: boolean
  busy: boolean
  referenceAt: string
  timezone: string
  machines: readonly ProductionMachine[]
  onEditMachines: () => void
  onAction: (stage: StageRun, action: "start" | "complete") => void
}) {
  const { t, i18n } = useTranslation()
  const locale = localeForLanguage(i18n.resolvedLanguage)
  const stageLabel = t(
    stage.stage === "sorting"
      ? "common.stage.sorting"
      : stage.stage === "washing"
        ? "common.stage.washing"
        : stage.stage === "drying"
          ? "common.stage.drying"
          : "common.stage.foldingPackaging"
  )
  const assignedMachines = stage.machineIds.map(
    (machineId) =>
      machines.find((machine) => machine.id === machineId)?.label ??
      t("production.assignedMachine")
  )
  const supportsMachines = stage.stage === "washing" || stage.stage === "drying"
  const action = presentation.action
  const startsEarly =
    stage.nextAction.state === "confirmation_required" &&
    stage.nextAction.action === "start"
  const presentationLabel = t(presentation.labelKey)
  const presentationDetail =
    presentation.detailKey === null ? null : t(presentation.detailKey)

  return (
    <Card
      size="sm"
      className="gap-3 bg-background py-3"
      aria-label={t("production.batchAria", {
        number: batchNumber,
        stage: stageLabel,
        status: stage.status,
      })}
    >
      <CardHeader className="gap-1.5 px-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>
            {t("production.batch", { number: batchNumber })}
          </CardTitle>
          <StatusBadge status={stage.status} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5 px-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <IconClock />
            {formatStageWindow(
              stage.plannedStartAt,
              stage.plannedEndAt,
              referenceAt,
              timezone,
              locale
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <IconScale />
            {t("common.pounds", { value: weight })}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <IconListDetails className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {t("production.batchOrderTriggerSummary", {
              orders: t("common.orders", { count: orderCount }),
              bags: t("common.bags", { count: bagCount }),
            })}
          </span>
          {pinned && <Badge variant="outline">{t("production.pinned")}</Badge>}
        </div>
        {supportsMachines && (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate text-muted-foreground">
              {assignedMachines.length === 0
                ? t("production.noMachines")
                : assignedMachines.join(" + ")}
            </span>
            {stage.status === "planned" &&
              machines.some((machine) => machine.active) && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11"
                  onClick={onEditMachines}
                  disabled={mutationDisabled}
                >
                  {t("production.editMachines")}
                </Button>
              )}
          </div>
        )}
        <Separator />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">{presentationLabel}</p>
            {presentationDetail !== null && (
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                {presentationDetail}
              </p>
            )}
            {presentation.availableAt !== null && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {formatCountdown(presentation.availableAt, now, t)}
              </p>
            )}
          </div>
          {action !== null && (
            <Button
              variant={action === "complete" ? "default" : "outline"}
              className="h-11"
              onClick={() => onAction(stage, action)}
              disabled={mutationDisabled}
              aria-busy={busy}
            >
              {busy ? (
                <Spinner data-icon="inline-start" />
              ) : action === "start" ? (
                <IconPlayerPlay data-icon="inline-start" />
              ) : (
                <IconCheck data-icon="inline-start" />
              )}
              {action === "start"
                ? startsEarly
                  ? t("production.startNow", { stage: stageLabel })
                  : t("production.startStage", { stage: stageLabel })
                : t("production.completeStage", { stage: stageLabel })}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function ProductionBoardWorkspace({
  ...input
}: ProductionBoardModelInput &
  Readonly<{
    onOpenSchedule?: (productionShiftId: string) => void
  }>) {
  const { t, i18n } = useTranslation()
  const locale = localeForLanguage(i18n.resolvedLanguage)
  const {
    board,
    busyId,
    error,
    announcement,
    earlyCompletion,
    earlyStart,
    floorProgressOpen,
    floorProgressError,
    floorProgressConfirmation,
    totalLbs,
    completedStages,
    refresh,
    act,
    confirmEarlyStart,
    dismissEarlyStart,
    confirmEarlyCompletion,
    dismissEarlyCompletion,
    selectedMachineIds,
    toggleMachine,
    assignMachines,
    mutateMembership,
    openFloorProgress,
    closeFloorProgress,
    reconcileFloorProgress,
    confirmFloorProgress,
    invalidateFloorProgressConfirmation,
  } = useProductionBoardModel(input)
  const [editingStageId, setEditingStageId] = useState<string | null>(null)
  const [batchInspectorOpen, setBatchInspectorOpen] = useState(false)
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const batchInspectorReturnFocusRef = useRef<HTMLButtonElement | null>(null)
  const isWide = useMediaQuery("(min-width: 1280px)", true)
  const isMobile = useMediaQuery("(max-width: 767px)", false)
  const boardAsOf = board?.asOf ?? "1970-01-01T00:00:00.000Z"
  const now = useBoardClock(boardAsOf)
  const updatesUnavailable =
    input.online === false ||
    (input.updatesState !== undefined && input.updatesState !== "open")
  const openBatchInspector = (batchId: string, trigger: HTMLButtonElement) => {
    batchInspectorReturnFocusRef.current = trigger
    setSelectedBatchId(batchId)
    setBatchInspectorOpen(true)
  }
  const mutationsDisabled =
    busyId !== null || updatesUnavailable || board === null

  const editingBatch = board?.batches.find((batch) =>
    batch.stages.some((stage) => stage.id === editingStageId)
  )
  const editingStage = editingBatch?.stages.find(
    (stage) => stage.id === editingStageId
  )
  const editingMachines =
    editingStage === undefined
      ? []
      : input.machines.filter(
          (machine) =>
            machine.active && machine.stationKind === editingStage.stage
        )
  const editingSelection =
    editingStage === undefined ? [] : selectedMachineIds(editingStage)
  const selectedCapacity = editingMachines.reduce(
    (sum, machine) =>
      editingSelection.includes(machine.id)
        ? sum + machine.effectiveCapacityLbs
        : sum,
    0
  )
  const defaultStage =
    board === null ? "sorting" : selectDefaultStage(board.batches)
  const refreshedBoundaries = useRef(new Set<string>())

  const serverBoundaries = useMemo(() => {
    if (board === null) return []
    return board.batches
      .flatMap((batch) => batch.stages)
      .flatMap((stage) =>
        (stage.nextAction.state === "blocked" ||
          stage.nextAction.state === "confirmation_required") &&
        stage.nextAction.availableAt !== null
          ? [
              {
                at: Date.parse(stage.nextAction.availableAt),
                key: `${stage.id}:${stage.nextAction.availableAt}`,
              },
            ]
          : []
      )
  }, [board])

  useEffect(() => {
    if (updatesUnavailable || board === null) return
    const dueKeys = serverBoundaries
      .filter((boundary) => boundary.at <= now)
      .map((boundary) => boundary.key)
      .filter((key) => !refreshedBoundaries.current.has(key))
    if (dueKeys.length === 0) return
    for (const key of dueKeys) refreshedBoundaries.current.add(key)
    void refresh()
  }, [board, now, refresh, serverBoundaries, updatesUnavailable])

  const closeMachineEditor = () => {
    if (editingStage !== undefined) {
      const machineIds = new Set([
        ...editingSelection,
        ...editingStage.machineIds,
      ])
      for (const machineId of machineIds)
        toggleMachine(
          editingStage,
          machineId,
          editingStage.machineIds.includes(machineId)
        )
    }
    setEditingStageId(null)
  }

  const openMachineEditor = (stage: StageRun) => {
    const activeCompatibleIds = new Set(
      input.machines
        .filter(
          (machine) => machine.active && machine.stationKind === stage.stage
        )
        .map((machine) => machine.id)
    )
    for (const machineId of selectedMachineIds(stage))
      if (!activeCompatibleIds.has(machineId))
        toggleMachine(stage, machineId, false)
    setEditingStageId(stage.id)
  }

  if (board === null)
    return (
      <Card className="mx-auto max-w-xl bg-background p-8 text-center">
        <CardTitle>{t("production.loading")}</CardTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("production.readingTruth")}
        </p>
      </Card>
    )

  const renderStageLane = (kind: ProductionStageKind) => (
    <section key={kind} aria-labelledby={`stage-${kind}`}>
      <div className="flex items-center justify-between py-2">
        <h2 id={`stage-${kind}`} className="text-sm font-semibold">
          {t(
            kind === "sorting"
              ? "common.stage.sorting"
              : kind === "washing"
                ? "common.stage.washing"
                : kind === "drying"
                  ? "common.stage.drying"
                  : "common.stage.foldingPackaging"
          )}
        </h2>
        <Badge variant="outline">
          {
            board.batches.filter(
              (batch) =>
                batch.stages.find((stage) => stage.stage === kind)?.status ===
                "completed"
            ).length
          }
          /{board.batches.length}
        </Badge>
      </div>
      <Separator className="mb-2.5" />
      <div className="flex flex-col gap-2.5">
        {board.batches.map((batch) => {
          const stage = batch.stages.find(
            (candidate) => candidate.stage === kind
          )!
          return (
            <StageCard
              key={stage.id}
              stage={stage}
              batchNumber={batch.sequence + 1}
              weight={batch.derivedWeightLbs}
              orderCount={batch.orders.length}
              bagCount={batch.orders.reduce(
                (sum, order) => sum + order.bagCount,
                0
              )}
              pinned={batch.orders.some((order) => order.pinnedAt !== null)}
              presentation={presentStage({ stage, now })}
              now={now}
              mutationDisabled={mutationsDisabled}
              busy={busyId === stage.id}
              referenceAt={board.asOf}
              timezone={input.timezone}
              machines={input.machines.filter(
                (machine) => machine.stationKind === kind
              )}
              onEditMachines={() => openMachineEditor(stage)}
              onAction={(selected, action) => void act(selected, action)}
            />
          )
        })}
      </div>
    </section>
  )

  return (
    <div className="flex flex-col gap-6">
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      <SectionHeading
        title={t("production.liveRun")}
        description={t("production.runDescription", {
          window: formatStageWindow(
            board.productionShift.startsAt,
            board.productionShift.endsAt,
            board.asOf,
            input.timezone,
            locale
          ),
          updated: formatMoment(board.asOf, board.asOf, input.timezone, locale),
        })}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {updatesUnavailable && (
              <Badge variant="outline">
                {input.online === false
                  ? t("production.offlineShort")
                  : input.updatesState === "reconnecting"
                    ? t("production.reconnectingShort")
                    : t("production.connectingShort")}
              </Badge>
            )}
            <Button
              variant="outline"
              className="h-11"
              onClick={openFloorProgress}
              disabled={
                mutationsDisabled || board.productionRun.status === "completed"
              }
            >
              <IconHistory data-icon="inline-start" />
              {t("production.recordProgress")}
            </Button>
            <Button
              variant="outline"
              className="h-11"
              onClick={() => void refresh()}
              disabled={input.online === false}
            >
              <IconRefresh data-icon="inline-start" />
              {t("common.refresh")}
            </Button>
          </div>
        }
      />

      {updatesUnavailable && (
        <Alert>
          <IconAlertTriangle />
          <AlertTitle>
            {input.online === false
              ? t("production.offline")
              : input.updatesState === "reconnecting"
                ? t("production.reconnecting")
                : t("production.connecting")}
          </AlertTitle>
          <AlertDescription>{t("production.updatesPaused")}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" role="alert">
          <IconAlertTriangle />
          <AlertTitle>{t("production.actionAttention")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <MetricStrip
        label={t("production.summary")}
        metrics={[
          {
            label: t("production.productionStatus"),
            value:
              board.productionRun.status === "completed"
                ? t("production.completed")
                : board.productionRun.status === "planned"
                  ? t("production.planned")
                  : t("production.started"),
            detail: t("production.queueLifecycle", {
              queue: board.productionRun.queueVersion,
              lifecycle: board.productionRun.version,
            }),
          },
          {
            label: t("production.scheduledDemand"),
            value: t("common.pounds", { value: totalLbs }),
            detail: t("production.demandDetail", {
              batches: t("common.batches", {
                count: board.batches.length,
              }),
              finish: formatMoment(
                board.productionRun.plannedCompletionAt,
                board.asOf,
                input.timezone,
                locale
              ),
              overtime:
                board.productionRun.overtimeAcknowledgement === null
                  ? ""
                  : t("production.overtimeAcceptedSuffix"),
            }),
          },
          {
            label: t("production.stageProgress"),
            value: `${completedStages}/${board.batches.length * 4}`,
            detail: t("production.operatorPulses"),
          },
          {
            label: t("production.pulse"),
            value:
              board.batches[0] === undefined
                ? "—"
                : `${board.batches[0].pulseMinutes} min`,
            detail:
              board.batches[0] === undefined
                ? t("production.noAcceptedCapacity")
                : t("production.maximum", {
                    weight: board.batches[0].pulseCapacityLbs,
                  }),
          },
        ]}
      />

      {board.eligibleOrders.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-background text-muted-foreground shadow-xs ring-1 ring-border [&_svg]:size-4"
              aria-hidden="true"
            >
              <IconCalendarPlus />
            </div>
            <div className="min-w-0">
              <p className="font-medium">
                {t("production.readyForSchedule", {
                  count: board.eligibleOrders.length,
                })}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t("production.readyForScheduleDescription")}
              </p>
            </div>
          </div>
          {input.onOpenSchedule !== undefined && (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full shrink-0 sm:w-auto"
              onClick={() => input.onOpenSchedule?.(board.productionShift.id)}
            >
              {t("production.reviewInSchedule")}
              <IconArrowRight data-icon="inline-end" />
            </Button>
          )}
        </div>
      )}
      {board.batches.length > 0 && (
        <Card className="bg-background">
          <CardHeader>
            <CardTitle>{t("production.batchMembership")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 lg:grid-cols-2">
            {board.batches.map((batch) => {
              const orderCount = batch.orders.length
              const bagCount = batch.orders.reduce(
                (sum, order) => sum + order.bagCount,
                0
              )
              const summary = t("production.batchManifestSummary", {
                orders: t("common.orders", { count: orderCount }),
                bags: t("common.bags", { count: bagCount }),
                weight: t("common.pounds", {
                  value: batch.derivedWeightLbs,
                }),
              })

              return (
                <div
                  key={batch.id}
                  className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {t("production.batch", { number: batch.sequence + 1 })}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <StatusBadge status={batch.status} />
                      <span>
                        {batch.membership.state === "frozen"
                          ? t("production.membershipFrozen")
                          : t("production.membershipMutable")}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {summary}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      aria-label={t("production.viewBatchOrders", {
                        number: batch.sequence + 1,
                        summary,
                      })}
                      onClick={(event) =>
                        openBatchInspector(batch.id, event.currentTarget)
                      }
                    >
                      <IconListDetails data-icon="inline-start" />
                      {t("production.viewOrders")}
                    </Button>
                    {batch.status === "queued" &&
                      batch.membership.state === "mutable" && (
                        <Button
                          variant="outline"
                          className="h-11"
                          disabled={mutationsDisabled}
                          onClick={() => void mutateMembership(batch, "freeze")}
                        >
                          <IconLock data-icon="inline-start" />{" "}
                          {t("production.freeze")}
                        </Button>
                      )}
                    {input.canManage &&
                      batch.status === "queued" &&
                      batch.membership.state === "frozen" && (
                        <Button
                          variant="outline"
                          className="h-11"
                          disabled={mutationsDisabled}
                          onClick={() =>
                            void mutateMembership(batch, "unfreeze")
                          }
                        >
                          <IconLockOpen data-icon="inline-start" />{" "}
                          {t("production.unfreeze")}
                        </Button>
                      )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {board.batches.length === 0 ? (
        <Card className="grid min-h-72 place-items-center bg-background text-center">
          <div>
            <IconStack2 className="mx-auto text-muted-foreground" />
            <p className="mt-3 font-medium">
              {t("production.noAcceptedBatches")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("production.noAcceptedBatchesDescription")}
            </p>
          </div>
        </Card>
      ) : (
        <>
          {isWide ? (
            <div className="grid grid-cols-4 gap-3">
              {productionStages.map(renderStageLane)}
            </div>
          ) : (
            <Tabs defaultValue={defaultStage}>
              <TabsList
                className="grid h-11 w-full grid-cols-4"
                aria-label={t("production.stages")}
              >
                {productionStages.map((kind) => (
                  <TabsTrigger
                    key={kind}
                    value={kind}
                    className="min-w-0 px-1 text-xs sm:text-sm"
                  >
                    {kind === "folding_packaging"
                      ? t("production.fold")
                      : t(
                          kind === "sorting"
                            ? "common.stage.sorting"
                            : kind === "washing"
                              ? "common.stage.washing"
                              : "common.stage.drying"
                        )}
                  </TabsTrigger>
                ))}
              </TabsList>
              {productionStages.map((kind) => (
                <TabsContent key={kind} value={kind}>
                  {renderStageLane(kind)}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </>
      )}

      <BatchOrderInspector
        open={batchInspectorOpen}
        batches={board.batches}
        selectedBatchId={selectedBatchId}
        isMobile={isMobile}
        returnFocusRef={batchInspectorReturnFocusRef}
        onOpenChange={setBatchInspectorOpen}
        onSelectedBatchChange={setSelectedBatchId}
      />

      <Sheet
        open={editingStage !== undefined}
        onOpenChange={(open) => {
          if (!open) closeMachineEditor()
        }}
      >
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          size="workspace"
          closeLabel={t("common.close")}
        >
          {editingStage !== undefined && editingBatch !== undefined && (
            <>
              <SheetHeader className="border-b px-4 pe-16 pb-4">
                <SheetTitle>
                  {t("production.assignMachines", {
                    stage: t(
                      editingStage.stage === "washing"
                        ? "common.stage.washing"
                        : "common.stage.drying"
                    ).toLocaleLowerCase(locale),
                  })}
                </SheetTitle>
                <SheetDescription>
                  {t("production.assignMachinesDescription", {
                    batch: editingBatch.sequence + 1,
                    weight: editingBatch.derivedWeightLbs,
                  })}
                </SheetDescription>
              </SheetHeader>
              <ScrollArea className="min-h-0 flex-1 px-4">
                <FieldSet>
                  <FieldLegend>
                    {t("production.activeCompatibleMachines")}
                  </FieldLegend>
                  <FieldGroup className="gap-2">
                    {editingMachines.map((machine) => (
                      <Field
                        key={machine.id}
                        orientation="horizontal"
                        className="min-h-11 rounded-lg border px-3 py-2"
                      >
                        <Checkbox
                          id={`${editingStage.id}-${machine.id}`}
                          checked={editingSelection.includes(machine.id)}
                          onCheckedChange={(checked) =>
                            toggleMachine(
                              editingStage,
                              machine.id,
                              checked === true
                            )
                          }
                          disabled={mutationsDisabled}
                        />
                        <FieldLabel
                          htmlFor={`${editingStage.id}-${machine.id}`}
                          className="min-w-0 flex-1"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {machine.label}
                          </span>
                          <span className="text-muted-foreground">
                            {machine.effectiveCapacityLbs} lb
                          </span>
                        </FieldLabel>
                      </Field>
                    ))}
                  </FieldGroup>
                </FieldSet>
              </ScrollArea>
              {error !== null && (
                <Alert variant="destructive" className="mx-4">
                  <IconAlertTriangle />
                  <AlertTitle>{t("production.assignmentFailed")}</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <SheetFooter className="border-t">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {t("production.selectedCapacity")}
                  </span>
                  <span
                    className={cn(
                      "font-medium",
                      selectedCapacity < editingBatch.derivedWeightLbs &&
                        "text-warning-foreground"
                    )}
                  >
                    {selectedCapacity} / {editingBatch.derivedWeightLbs} lb
                  </span>
                </div>
                {selectedCapacity < editingBatch.derivedWeightLbs && (
                  <p className="text-sm text-warning-foreground">
                    {t("production.insufficientCapacity")}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    className="h-11"
                    onClick={closeMachineEditor}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    className="h-11"
                    disabled={
                      mutationsDisabled || editingSelection.length === 0
                    }
                    aria-busy={busyId === editingStage.id}
                    onClick={async () => {
                      if (await assignMachines(editingStage))
                        setEditingStageId(null)
                    }}
                  >
                    {busyId === editingStage.id && (
                      <Spinner data-icon="inline-start" />
                    )}
                    {t("production.saveMachines")}
                  </Button>
                </div>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      <FloorProgressReconciliationSheet
        key={
          floorProgressOpen ? "floor-progress-open" : "floor-progress-closed"
        }
        open={floorProgressOpen}
        isMobile={isMobile}
        batches={board.batches}
        machines={input.machines}
        busy={busyId !== null}
        error={floorProgressError}
        confirmation={floorProgressConfirmation}
        onOpenChange={(open) => {
          if (!open) closeFloorProgress()
        }}
        onSubmit={(draft) => void reconcileFloorProgress(draft)}
        onConfirm={() => void confirmFloorProgress()}
        onInvalidateConfirmation={invalidateFloorProgressConfirmation}
      />

      <EarlyStageStartDialog
        stage={earlyStart?.stage ?? null}
        timing={earlyStart?.result.timing ?? null}
        referenceAt={board.asOf}
        timezone={input.timezone}
        busy={busyId !== null}
        onOpenChange={(open) => {
          if (!open && busyId === null) dismissEarlyStart()
        }}
        onConfirm={() => void confirmEarlyStart()}
      />

      <AlertDialog
        open={earlyCompletion !== null}
        onOpenChange={(open) => {
          if (!open && busyId === null) dismissEarlyCompletion()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-warning text-warning-foreground">
              <IconClock />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {t("production.completeEarlyTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {earlyCompletion === null
                ? t("production.pulseStillRunning")
                : t("production.completeEarlyDescription", {
                    stage: t(
                      earlyCompletion.stage.stage === "sorting"
                        ? "common.stage.sorting"
                        : earlyCompletion.stage.stage === "washing"
                          ? "common.stage.washing"
                          : earlyCompletion.stage.stage === "drying"
                            ? "common.stage.drying"
                            : "common.stage.foldingPackaging"
                    ),
                    elapsed: formatDuration(
                      earlyCompletion.result.timing.elapsedMilliseconds,
                      t
                    ),
                    planned: formatDuration(
                      earlyCompletion.result.timing.plannedDurationMilliseconds,
                      t
                    ),
                    remaining: formatDuration(
                      earlyCompletion.result.timing.remainingMilliseconds,
                      t
                    ),
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>
              {t("production.keepRunning")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busyId !== null}
              onClick={(event) => {
                event.preventDefault()
                void confirmEarlyCompletion()
              }}
            >
              {busyId !== null && <Spinner data-icon="inline-start" />}
              {t("production.completeEarly")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const formatDuration = (milliseconds: number, t: TFunction): string => {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000))
  if (totalMinutes < 60)
    return t("common.minutesShort", { minutes: totalMinutes })
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0
    ? t("production.hoursShort", { hours })
    : t("production.hoursMinutesShort", { hours, minutes })
}
