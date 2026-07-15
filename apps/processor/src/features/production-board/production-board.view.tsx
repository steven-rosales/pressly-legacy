import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconLock,
  IconLockOpen,
  IconPlayerPlay,
  IconRefresh,
  IconScale,
  IconStack2,
  IconWand,
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { cn } from "@/components/ui/class-names"
import {
  useProductionBoardModel,
  type ProductionBoardModelInput,
} from "./production-board.model"
import {
  formatCountdown,
  formatMoment,
  formatStageWindow,
  presentStage,
  productionStageLabels,
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
      {status.replaceAll("_", " ")}
    </Badge>
  )
}

function StageCard({
  stage,
  batchNumber,
  weight,
  orders,
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
  orders: string
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
  const assignedMachines = stage.machineIds.map(
    (machineId) =>
      machines.find((machine) => machine.id === machineId)?.label ??
      "Assigned machine"
  )
  const supportsMachines = stage.stage === "washing" || stage.stage === "drying"
  const action = presentation.action

  return (
    <Card
      size="sm"
      className="gap-3 bg-background py-3"
      aria-label={`Batch ${batchNumber}, ${productionStageLabels[stage.stage]}, ${stage.status}`}
    >
      <CardHeader className="gap-1.5 px-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Batch {batchNumber}</CardTitle>
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
              timezone
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <IconScale />
            {weight} lb
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {orders}
          </p>
          {pinned && <Badge variant="outline">Pinned</Badge>}
        </div>
        {supportsMachines && (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate text-muted-foreground">
              {assignedMachines.length === 0
                ? "No machines assigned"
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
                  Edit machines
                </Button>
              )}
          </div>
        )}
        <Separator />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">{presentation.label}</p>
            {presentation.detail !== null && (
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                {presentation.detail}
              </p>
            )}
            {presentation.availableAt !== null && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {formatCountdown(presentation.availableAt, now)}
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
                ? `Start ${productionStageLabels[stage.stage]}`
                : `Complete ${productionStageLabels[stage.stage]}`}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function ProductionBoardWorkspace({
  ...input
}: ProductionBoardModelInput) {
  const {
    board,
    busyId,
    error,
    announcement,
    earlyCompletion,
    totalLbs,
    completedStages,
    refresh,
    act,
    confirmEarlyCompletion,
    dismissEarlyCompletion,
    selectedMachineIds,
    toggleMachine,
    assignMachines,
    exactBatchSelections,
    mutateMembership,
    retryAutomaticPlacement,
    selectExactBatch,
    placeOrderExactly,
    confirmOvertime,
  } = useProductionBoardModel(input)
  const [editingStageId, setEditingStageId] = useState<string | null>(null)
  const isWide = useMediaQuery("(min-width: 1280px)", true)
  const isMobile = useMediaQuery("(max-width: 767px)", false)
  const boardAsOf = board?.asOf ?? "1970-01-01T00:00:00.000Z"
  const now = useBoardClock(boardAsOf)
  const updatesUnavailable =
    input.online === false ||
    (input.updatesState !== undefined && input.updatesState !== "open")
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
        <CardTitle>Loading production board…</CardTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          Reading current operational truth.
        </p>
      </Card>
    )

  const renderStageLane = (kind: ProductionStageKind) => (
    <section key={kind} aria-labelledby={`stage-${kind}`}>
      <div className="flex items-center justify-between py-2">
        <h2 id={`stage-${kind}`} className="text-sm font-semibold">
          {productionStageLabels[kind]}
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
              orders={batch.orders
                .map((order) => order.externalOrderId)
                .join(" + ")}
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
        title="Live production run"
        description={`Shift ${formatStageWindow(board.productionShift.startsAt, board.productionShift.endsAt, board.asOf, input.timezone)} · updated ${formatMoment(board.asOf, board.asOf, input.timezone)}`}
        action={
          <div className="flex items-center gap-2">
            {updatesUnavailable && (
              <Badge variant="outline">
                {input.online === false
                  ? "Offline"
                  : input.updatesState === "reconnecting"
                    ? "Reconnecting"
                    : "Connecting"}
              </Badge>
            )}
            <Button
              variant="outline"
              className="h-11"
              onClick={() => void refresh()}
              disabled={input.online === false}
            >
              <IconRefresh data-icon="inline-start" />
              Refresh
            </Button>
          </div>
        }
      />

      {updatesUnavailable && (
        <Alert>
          <IconAlertTriangle />
          <AlertTitle>
            {input.online === false
              ? "Board is offline"
              : input.updatesState === "reconnecting"
                ? "Live updates are reconnecting"
                : "Connecting live updates"}
          </AlertTitle>
          <AlertDescription>
            Production commands are paused until the live change stream is
            current. You can still refresh this board manually.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" role="alert">
          <IconAlertTriangle />
          <AlertTitle>Board action needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <MetricStrip
        label="Production summary"
        metrics={[
          {
            label: "Production status",
            value:
              board.productionRun.status === "completed"
                ? "Completed"
                : board.productionRun.status === "planned"
                  ? "Planned"
                  : "Started",
            detail: `Queue v${board.productionRun.queueVersion} · lifecycle v${board.productionRun.version}`,
          },
          {
            label: "Scheduled demand",
            value: `${totalLbs} lb`,
            detail: `${board.batches.length} batches · finish ${formatMoment(board.productionRun.plannedCompletionAt, board.asOf, input.timezone)}${board.productionRun.overtimeAcknowledgement === null ? "" : " · overtime accepted"}`,
          },
          {
            label: "Stage progress",
            value: `${completedStages}/${board.batches.length * 4}`,
            detail: "Operator-confirmed pulses",
          },
          {
            label: "Pulse",
            value:
              board.batches[0] === undefined
                ? "—"
                : `${board.batches[0].pulseMinutes} min`,
            detail:
              board.batches[0] === undefined
                ? "No accepted capacity"
                : `${board.batches[0].pulseCapacityLbs} lb maximum`,
          },
        ]}
      />

      {board.eligibleOrders.length > 0 && (
        <Card className="border-warning-foreground/20 bg-background">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Pending arrivals</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  These eligible orders are visible but not yet in the live
                  queue.
                </p>
              </div>
              <Badge variant="secondary">{board.eligibleOrders.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="divide-y rounded-lg border p-0">
            {board.eligibleOrders.map((order) => {
              const confirmation =
                order.placement.status === "confirmation_required" &&
                order.placement.productionRunId === board.productionRun.id
                  ? order.placement
                  : undefined
              const mutableBatches = board.batches.filter(
                (batch) =>
                  batch.status === "queued" &&
                  batch.membership.state === "mutable"
              )
              return (
                <div key={order.id} className="flex flex-col gap-3 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-48 flex-1">
                      <p className="font-medium">
                        Order {order.externalOrderId}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {order.derivedWeightLbs} lb · {order.bagCount} bags
                        {order.priority ? " · priority" : ""}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="h-11"
                      disabled={mutationsDisabled}
                      onClick={() => void retryAutomaticPlacement(order)}
                    >
                      <IconWand data-icon="inline-start" />
                      Retry automatic
                    </Button>
                  </div>
                  {(order.placement.status === "awaiting_run" ||
                    order.placement.status === "ambiguous_run") && (
                    <Alert>
                      <IconAlertTriangle />
                      <AlertTitle>
                        {order.placement.status === "ambiguous_run"
                          ? "Run selection required"
                          : "Placement pending"}
                      </AlertTitle>
                      <AlertDescription>
                        {order.placement.message}
                      </AlertDescription>
                    </Alert>
                  )}
                  {order.placement.status === "not_placed" && (
                    <Alert>
                      <IconAlertTriangle />
                      <AlertTitle>
                        Automatic placement needs attention
                      </AlertTitle>
                      <AlertDescription>
                        {order.placement.message}
                        {order.placement.preview !== null && (
                          <span className="mt-1 block text-sm">
                            Last proposal: queue v
                            {order.placement.preview.queueVersion}, finish{" "}
                            {formatMoment(
                              order.placement.preview.projectedCompletionAt,
                              board.asOf,
                              input.timezone
                            )}
                            .
                          </span>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                  {order.placement.status === "confirmation_required" &&
                    order.placement.productionRunId !==
                      board.productionRun.id && (
                      <Alert>
                        <IconAlertTriangle />
                        <AlertTitle>Proposal belongs to another run</AlertTitle>
                        <AlertDescription>
                          Open that run to confirm its overtime proposal, or
                          retry automatic placement into this queue.
                        </AlertDescription>
                      </Alert>
                    )}
                  {input.canManage && mutableBatches.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <NativeSelect
                        className="min-w-48 flex-1 [&_[data-slot=native-select]]:h-11"
                        aria-label={`Exact batch for order ${order.externalOrderId}`}
                        disabled={mutationsDisabled}
                        value={exactBatchSelections[order.id] ?? ""}
                        onChange={(event) =>
                          selectExactBatch(order.id, event.target.value)
                        }
                      >
                        <NativeSelectOption value="" disabled>
                          Choose exact queued batch
                        </NativeSelectOption>
                        {mutableBatches.map((batch) => (
                          <NativeSelectOption key={batch.id} value={batch.id}>
                            Batch {batch.sequence + 1} ·{" "}
                            {batch.derivedWeightLbs}/{batch.pulseCapacityLbs} lb
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <Button
                        variant="secondary"
                        className="h-11"
                        disabled={
                          mutationsDisabled ||
                          exactBatchSelections[order.id] === undefined
                        }
                        onClick={() => void placeOrderExactly(order)}
                      >
                        Place exactly
                      </Button>
                    </div>
                  )}
                  {confirmation !== undefined && (
                    <Alert className="border-warning-foreground/20 bg-warning text-warning-foreground">
                      <IconAlertTriangle />
                      <AlertTitle>Overtime confirmation required</AlertTitle>
                      <AlertDescription className="flex flex-col items-start gap-2">
                        <span>
                          This exact queue proposal adds{" "}
                          {confirmation.overtimeMinutes} minutes and finishes at{" "}
                          {formatMoment(
                            confirmation.projectedCompletionAt,
                            board.asOf,
                            input.timezone
                          )}
                          .
                        </span>
                        {input.canManage ? (
                          <Button
                            className="h-11"
                            disabled={mutationsDisabled}
                            onClick={() => void confirmOvertime(order)}
                          >
                            Confirm overtime and place
                          </Button>
                        ) : (
                          <span>
                            Owner or administrator approval is required.
                          </span>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {board.batches.length > 0 && (
        <Card className="bg-background">
          <CardHeader>
            <CardTitle>Queue membership</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {board.batches.map((batch) => (
              <div
                key={batch.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium">Batch {batch.sequence + 1}</p>
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <StatusBadge status={batch.status} />
                    <span>
                      {batch.membership.state === "frozen"
                        ? "Membership frozen"
                        : "Membership mutable"}
                    </span>
                  </div>
                </div>
                {batch.status === "queued" &&
                  batch.membership.state === "mutable" && (
                    <Button
                      variant="outline"
                      className="h-11"
                      disabled={mutationsDisabled}
                      onClick={() => void mutateMembership(batch, "freeze")}
                    >
                      <IconLock data-icon="inline-start" /> Freeze
                    </Button>
                  )}
                {input.canManage &&
                  batch.status === "queued" &&
                  batch.membership.state === "frozen" && (
                    <Button
                      variant="outline"
                      className="h-11"
                      disabled={mutationsDisabled}
                      onClick={() => void mutateMembership(batch, "unfreeze")}
                    >
                      <IconLockOpen data-icon="inline-start" /> Unfreeze
                    </Button>
                  )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {board.batches.length === 0 ? (
        <Card className="grid min-h-72 place-items-center bg-background text-center">
          <div>
            <IconStack2 className="mx-auto text-muted-foreground" />
            <p className="mt-3 font-medium">No accepted batches</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Start an accepted schedule to populate the floor board.
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
                aria-label="Production stages"
              >
                {productionStages.map((kind) => (
                  <TabsTrigger key={kind} value={kind}>
                    {kind === "folding_packaging"
                      ? "Fold"
                      : productionStageLabels[kind]}
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

      <Sheet
        open={editingStage !== undefined}
        onOpenChange={(open) => {
          if (!open) closeMachineEditor()
        }}
      >
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(isMobile ? "max-h-[85vh]" : "sm:max-w-md")}
        >
          {editingStage !== undefined && editingBatch !== undefined && (
            <>
              <SheetHeader className="border-b px-4 pb-4">
                <SheetTitle>
                  Assign{" "}
                  {productionStageLabels[editingStage.stage].toLowerCase()}{" "}
                  machines
                </SheetTitle>
                <SheetDescription>
                  Batch {editingBatch.sequence + 1} needs{" "}
                  {editingBatch.derivedWeightLbs} lb of active compatible
                  capacity. Saving replaces the full machine set for this stage.
                </SheetDescription>
              </SheetHeader>
              <ScrollArea
                className={cn(
                  "px-4",
                  isMobile ? "max-h-[45vh]" : "min-h-0 flex-1"
                )}
              >
                <FieldSet>
                  <FieldLegend>Active compatible machines</FieldLegend>
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
                  <AlertTitle>Machine assignment not saved</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <SheetFooter className="border-t">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    Selected capacity
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
                    The server will reject capacity below the batch demand.
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    className="h-11"
                    onClick={closeMachineEditor}
                  >
                    Cancel
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
                    Save machines
                  </Button>
                </div>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

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
            <AlertDialogTitle>Complete this stage early?</AlertDialogTitle>
            <AlertDialogDescription>
              {earlyCompletion === null
                ? "The planned pulse is still running."
                : `${productionStageLabels[earlyCompletion.stage.stage]} has run for ${formatDuration(earlyCompletion.result.timing.elapsedMilliseconds)} of its ${formatDuration(earlyCompletion.result.timing.plannedDurationMilliseconds)} planned pulse. ${formatDuration(earlyCompletion.result.timing.remainingMilliseconds)} remains.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>
              Keep running
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busyId !== null}
              onClick={(event) => {
                event.preventDefault()
                void confirmEarlyCompletion()
              }}
            >
              {busyId !== null && <Spinner data-icon="inline-start" />}
              Complete early
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const formatDuration = (milliseconds: number): string => {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000))
  if (totalMinutes < 60) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`
}
