import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconPlayerPlay,
  IconRefresh,
  IconScale,
  IconStack2,
} from "@tabler/icons-react"
import type { ProductionMachine, StageRun } from "@pressly/contracts"
import {
  MetricCard,
  SectionHeading,
} from "@/components/layout/workspace-primitives"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/components/ui/class-names"
import {
  useProductionBoardModel,
  type ProductionBoardModelInput,
} from "./production-board.model"

const stages = ["sorting", "washing", "drying", "folding_packaging"] as const

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
  busy,
  timezone,
  machines,
  selectedMachineIds,
  onToggleMachine,
  onAssignMachines,
  onAction,
}: {
  stage: StageRun
  batchNumber: number
  weight: number
  orders: string
  busy: boolean
  timezone: string
  machines: readonly ProductionMachine[]
  selectedMachineIds: readonly string[]
  onToggleMachine: (machineId: string, checked: boolean) => void
  onAssignMachines: () => void
  onAction: (stage: StageRun, action: "start" | "complete") => void
}) {
  return (
    <Card
      size="sm"
      className="bg-background shadow-xs"
      aria-label={`Batch ${batchNumber}, ${stageLabels[stage.stage]}, ${stage.status}`}
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Batch {batchNumber}</CardTitle>
          <StatusBadge status={stage.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <IconClock className="size-3.5" />
            {formatClock(stage.plannedStartAt, timezone)}–
            {formatClock(stage.plannedEndAt, timezone)}
          </span>
          <span className="flex items-center gap-1.5">
            <IconScale className="size-3.5" />
            {weight} lb
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{orders}</p>
        {stage.machineIds.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {stage.machineIds.map((machineId) => (
              <Badge key={machineId} variant="outline">
                {machines.find((machine) => machine.id === machineId)?.label ??
                  "Assigned machine"}
              </Badge>
            ))}
          </div>
        )}
        {stage.status === "planned" && machines.length > 0 && (
          <FieldSet>
            <FieldLegend variant="label">Machine assignment</FieldLegend>
            <FieldGroup className="gap-2">
              {machines.map((machine) => (
                <Field key={machine.id} orientation="horizontal">
                  <Checkbox
                    id={`${stage.id}-${machine.id}`}
                    checked={selectedMachineIds.includes(machine.id)}
                    onCheckedChange={(checked) =>
                      onToggleMachine(machine.id, checked === true)
                    }
                  />
                  <FieldLabel
                    htmlFor={`${stage.id}-${machine.id}`}
                    className="min-w-0 flex-1 text-xs"
                  >
                    {machine.label} · {machine.effectiveCapacityLbs} lb
                  </FieldLabel>
                </Field>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={onAssignMachines}
                disabled={busy || selectedMachineIds.length === 0}
              >
                {busy && <Spinner data-icon="inline-start" />}
                Save machines
              </Button>
            </FieldGroup>
          </FieldSet>
        )}
        {stage.allowedActions.map((action) => (
          <Button
            key={action}
            className="w-full"
            variant={action === "complete" ? "default" : "outline"}
            onClick={() => onAction(stage, action)}
            disabled={busy}
          >
            {action === "start" ? (
              <IconPlayerPlay data-icon="inline-start" />
            ) : (
              <IconCheck data-icon="inline-start" />
            )}
            {action === "start"
              ? `Start ${stageLabels[stage.stage]}`
              : `Complete ${stageLabels[stage.stage]}`}
          </Button>
        ))}
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
    totalLbs,
    completedStages,
    refresh,
    startRun,
    act,
    selectedMachineIds,
    toggleMachine,
    assignMachines,
  } = useProductionBoardModel(input)

  if (board === null)
    return (
      <Card className="mx-auto max-w-xl bg-background p-8 text-center shadow-xs">
        <CardTitle>Loading production board…</CardTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          Reading current operational truth.
        </p>
      </Card>
    )

  return (
    <div className="space-y-6">
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      <SectionHeading
        title="Production floor"
        description={`Shift ${formatClock(board.productionShift.startsAt, input.timezone)}–${formatClock(board.productionShift.endsAt, input.timezone)} · updated ${formatClock(board.asOf, input.timezone)}`}
        action={
          <Button variant="outline" onClick={() => void refresh()}>
            <IconRefresh data-icon="inline-start" />
            Refresh
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" role="alert">
          <IconAlertTriangle />
          <AlertTitle>Board action needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Production status"
          value={board.productionRun?.status ?? "Not started"}
          detail={`Run version ${board.productionRun?.version ?? "—"}`}
        />
        <MetricCard
          label="Scheduled demand"
          value={`${totalLbs} lb`}
          detail={`${board.batches.length} whole-order batches`}
        />
        <MetricCard
          label="Stage progress"
          value={`${completedStages}/${board.batches.length * 4}`}
          detail="Operator-confirmed pulses"
        />
        <MetricCard
          label="Pulse"
          value={
            board.batches[0] === undefined
              ? "—"
              : `${board.batches[0].pulseMinutes} min`
          }
          detail={
            board.batches[0] === undefined
              ? "No accepted capacity"
              : `${board.batches[0].pulseCapacityLbs} lb maximum`
          }
        />
      </div>

      {board.productionRun?.allowedActions.includes("start") && (
        <Card className="border-foreground/15 bg-background shadow-xs">
          <CardContent className="flex flex-col justify-between gap-4 py-1 sm:flex-row sm:items-center">
            <div>
              <p className="font-medium">Schedule accepted and ready</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Starting the run opens the first sorting pulse. Stage timing
                remains enforced by the server.
              </p>
            </div>
            <Button onClick={startRun} disabled={busyId !== null}>
              <IconPlayerPlay data-icon="inline-start" />
              Start production run
            </Button>
          </CardContent>
        </Card>
      )}

      {board.batches.length === 0 ? (
        <Card className="grid min-h-72 place-items-center bg-background text-center shadow-xs">
          <div>
            <IconStack2 className="mx-auto size-7 text-muted-foreground" />
            <p className="mt-3 font-medium">No accepted batches</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Accept a schedule to populate the floor board.
            </p>
          </div>
        </Card>
      ) : (
        <div className="overflow-x-auto pb-3">
          <div className="grid min-w-[1120px] grid-cols-4 gap-3 xl:min-w-0">
            {stages.map((kind) => (
              <section
                key={kind}
                aria-labelledby={`stage-${kind}`}
                className="rounded-xl border bg-muted/30 p-2.5"
              >
                <div className="flex items-center justify-between px-1 py-2">
                  <h2 id={`stage-${kind}`} className="text-sm font-semibold">
                    {stageLabels[kind]}
                  </h2>
                  <Badge variant="outline">
                    {
                      board.batches.filter(
                        (batch) =>
                          batch.stages.find((stage) => stage.stage === kind)
                            ?.status === "completed"
                      ).length
                    }
                    /{board.batches.length}
                  </Badge>
                </div>
                <Separator className="mb-2" />
                <div className="space-y-2.5">
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
                        busy={busyId === stage.id}
                        timezone={input.timezone}
                        machines={input.machines.filter(
                          (machine) =>
                            machine.active && machine.stationKind === kind
                        )}
                        selectedMachineIds={selectedMachineIds(stage)}
                        onToggleMachine={(machineId, checked) =>
                          toggleMachine(stage, machineId, checked)
                        }
                        onAssignMachines={() => void assignMachines(stage)}
                        onAction={(selected, action) =>
                          void act(selected, action)
                        }
                      />
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
