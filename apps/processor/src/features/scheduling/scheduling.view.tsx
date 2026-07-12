import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconRefresh,
  IconSparkles,
} from "@tabler/icons-react"
import {
  MetricCard,
  SectionHeading,
} from "@/components/layout/workspace-primitives"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  useSchedulingModel,
  type SchedulingModelInput,
} from "./scheduling.model"

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

export function SchedulingWorkspace({
  onAccepted,
  ...input
}: SchedulingModelInput & {
  onAccepted: (productionShiftId: string) => void
}) {
  const {
    proposal,
    orders,
    pulseMinutes,
    setPulseMinutes,
    foldRate,
    setFoldRate,
    folders,
    setFolders,
    shiftStartsAt,
    setShiftStartsAt,
    shiftEndsAt,
    setShiftEndsAt,
    horizonEnd,
    setHorizonEnd,
    priorityIds,
    acknowledged,
    setAcknowledged,
    busy,
    error,
    accepted,
    stageFitAssertions,
    stageFitConfirmed,
    setStageFitAssertion,
    blockingWarnings,
    totalLbs,
    totalBags,
    generate,
    togglePriority,
    accept,
  } = useSchedulingModel(input)
  const shiftMinutes = Math.max(
    0,
    Math.round((Date.parse(shiftEndsAt) - Date.parse(shiftStartsAt)) / 60_000)
  )
  const overflowMinutes = Math.max(
    0,
    (proposal?.makespanMinutes ?? 0) - shiftMinutes
  )
  const shiftCoverage =
    proposal === null || shiftMinutes === 0
      ? 0
      : Math.min(100, (proposal.makespanMinutes / shiftMinutes) * 100)

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Production schedule"
        description="Configure one fixed pulse, review the deterministic proposal, then accept the exact output shown here."
        action={
          <Button
            variant="outline"
            onClick={generate}
            disabled={busy !== null || !stageFitConfirmed}
          >
            <IconRefresh data-icon="inline-start" />
            Recompute
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" role="alert">
          <IconAlertTriangle />
          <AlertTitle>Schedule action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              label="Demand"
              value={`${totalLbs} lb`}
              detail={`${orders.length} whole orders · ${totalBags} bags`}
            />
            <MetricCard
              label="Pulse capacity"
              value={
                proposal === null ? "—" : `${proposal.pulseCapacityLbs} lb`
              }
              detail="Minimum across all stages"
            />
            <MetricCard
              label="Makespan"
              value={
                proposal === null ? "—" : `${proposal.makespanMinutes} min`
              }
              detail="Four-stage pipeline"
            />
            <MetricCard
              label="Forecast finish"
              value={
                proposal
                  ? formatClock(
                      proposal.plannedCompletionAt,
                      input.defaults.timezone
                    )
                  : "—"
              }
              detail={
                proposal === null
                  ? "Awaiting proposal"
                  : overflowMinutes > 0
                    ? `${overflowMinutes} min after shift`
                    : "Within the configured shift"
              }
            />
          </div>

          <Card className="bg-background shadow-xs">
            <Tabs defaultValue="proposal">
              <CardHeader className="border-b pb-0">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <CardTitle>Fixed-pulse proposal</CardTitle>
                    <CardDescription className="mt-1">
                      Whole orders stay together through four equal{" "}
                      {pulseMinutes}-minute stages.
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
                  {proposal === null ? (
                    <div className="grid min-h-64 place-items-center rounded-xl border border-dashed p-8 text-center">
                      <div>
                        <IconSparkles className="mx-auto size-6 text-muted-foreground" />
                        <p className="mt-3 font-medium">No proposal yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Publish the configuration to calculate a schedule.
                        </p>
                        <Button
                          className="mt-4"
                          onClick={generate}
                          disabled={busy !== null || !stageFitConfirmed}
                        >
                          Generate schedule
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-x-auto pb-2">
                      <div className="min-w-[820px] space-y-3">
                        <div className="grid grid-cols-[96px_repeat(4,minmax(150px,1fr))] gap-2 px-1 text-xs font-medium text-muted-foreground">
                          <span>Batch</span>
                          {Object.values(stageLabels).map((label) => (
                            <span key={label}>{label}</span>
                          ))}
                        </div>
                        {proposal.batches.map((batch) => (
                          <div
                            key={batch.sequence}
                            className="grid grid-cols-[96px_repeat(4,minmax(150px,1fr))] gap-2"
                          >
                            <div className="rounded-lg border bg-muted/40 p-3">
                              <p className="font-semibold">
                                #{batch.sequence + 1}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {batch.derivedWeightLbs} lb · {batch.bagCount}{" "}
                                bags
                              </p>
                            </div>
                            {batch.stages.map((stage) => (
                              <div
                                key={stage.stage}
                                className="rounded-lg border bg-background p-3 shadow-xs"
                              >
                                <div className="flex items-center gap-1.5 text-xs font-medium">
                                  <IconClock className="size-3.5 text-muted-foreground" />
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
                                <p className="mt-2 truncate text-xs text-muted-foreground">
                                  {stage.machineIds.length > 0
                                    ? `${stage.machineIds.length} machine`
                                    : "Team station"}
                                </p>
                              </div>
                            ))}
                          </div>
                        ))}
                        <div className="grid grid-cols-[96px_1fr] gap-2 pt-1">
                          <span className="text-xs text-muted-foreground">
                            Flow
                          </span>
                          <Progress
                            value={shiftCoverage}
                            aria-label={
                              overflowMinutes > 0
                                ? `Schedule extends ${overflowMinutes} minutes after the shift`
                                : "Schedule fits within the shift"
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </TabsContent>
              <TabsContent value="orders">
                <CardContent className="divide-y pt-1">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center gap-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          Order {order.externalOrderId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {order.derivedWeightLbs} lb · {order.bagCount} bags ·
                          due {order.dueBucket}
                        </p>
                      </div>
                      <Badge variant="outline">{order.dueBucket}</Badge>
                      <Switch
                        checked={priorityIds.has(order.id)}
                        onCheckedChange={(checked) =>
                          void togglePriority(order.id, order.version, checked)
                        }
                        aria-label={`Prioritize order ${order.externalOrderId}`}
                      />
                    </div>
                  ))}
                </CardContent>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="bg-background shadow-xs">
            <CardHeader>
              <CardTitle>Scheduler configuration</CardTitle>
              <CardDescription>
                Operational assertions are published with this immutable
                version.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="pulse-minutes">
                    Pulse duration
                  </FieldLabel>
                  <Input
                    id="pulse-minutes"
                    type="number"
                    min={1}
                    value={pulseMinutes}
                    onChange={(event) =>
                      setPulseMinutes(Number(event.target.value))
                    }
                  />
                  <FieldDescription>
                    Minutes for sorting, washing, drying, and folding.
                  </FieldDescription>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="fold-rate">Fold rate</FieldLabel>
                    <Input
                      id="fold-rate"
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={foldRate}
                      onChange={(event) =>
                        setFoldRate(Number(event.target.value))
                      }
                    />
                    <FieldDescription>lb / min / person</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="folders">Folders</FieldLabel>
                    <Input
                      id="folders"
                      type="number"
                      min={1}
                      value={folders}
                      onChange={(event) =>
                        setFolders(Number(event.target.value))
                      }
                    />
                    <FieldDescription>Effective headcount</FieldDescription>
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="shift-start">Shift start</FieldLabel>
                  <Input
                    id="shift-start"
                    type="datetime-local"
                    value={shiftStartsAt}
                    onChange={(event) => setShiftStartsAt(event.target.value)}
                  />
                  <FieldDescription>
                    Local time in {input.defaults.timezone}
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="shift-end">Shift end</FieldLabel>
                  <Input
                    id="shift-end"
                    type="datetime-local"
                    value={shiftEndsAt}
                    min={shiftStartsAt}
                    onChange={(event) => setShiftEndsAt(event.target.value)}
                  />
                  <FieldDescription>
                    Operators may shorten or extend the derived shift window.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="horizon">Planning horizon</FieldLabel>
                  <Input
                    id="horizon"
                    type="datetime-local"
                    value={horizonEnd}
                    min={shiftStartsAt}
                    onChange={(event) => setHorizonEnd(event.target.value)}
                  />
                  <FieldDescription>
                    Priority orders are included even beyond this horizon.
                  </FieldDescription>
                </Field>
                <div className="rounded-lg border bg-muted/40 p-3 text-xs">
                  <p className="font-medium">Stage-fit assertion</p>
                  <p className="mt-1 text-muted-foreground">
                    Confirm observed floor capability for this exact pulse
                    before publishing it.
                  </p>
                  <div className="mt-3 grid gap-2">
                    {(
                      [
                        ["sortingFits", "Sorting"],
                        ["washingFits", "Washing"],
                        ["dryingFits", "Drying"],
                      ] as const
                    ).map(([assertion, label]) => (
                      <Field key={assertion} orientation="horizontal">
                        <Checkbox
                          id={`stage-fit-${assertion}`}
                          checked={stageFitAssertions[assertion]}
                          onCheckedChange={(checked) =>
                            setStageFitAssertion(assertion, checked === true)
                          }
                        />
                        <FieldLabel
                          htmlFor={`stage-fit-${assertion}`}
                          className="font-normal"
                        >
                          I confirm {label.toLowerCase()} finishes within the
                          full {pulseMinutes || "configured"}-minute pulse.
                        </FieldLabel>
                      </Field>
                    ))}
                  </div>
                </div>
              </FieldGroup>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                onClick={generate}
                disabled={busy !== null || !stageFitConfirmed}
              >
                {busy === "generate" ? "Computing…" : "Publish & compute"}
              </Button>
            </CardFooter>
          </Card>

          {proposal && (
            <Card className="bg-background shadow-xs">
              <CardHeader>
                <CardTitle>Accept proposal</CardTitle>
                <CardDescription>
                  Acceptance is pinned to output{" "}
                  {proposal.outputPlanHash.slice(0, 10)}…
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {blockingWarnings.map((warning) => (
                  <Alert
                    key={warning.code}
                    className="border-warning-foreground/20 bg-warning text-warning-foreground"
                  >
                    <IconAlertTriangle />
                    <AlertTitle>Shift overflow</AlertTitle>
                    <AlertDescription>{warning.message}</AlertDescription>
                  </Alert>
                ))}
                {blockingWarnings.length > 0 && (
                  <Field orientation="horizontal">
                    <Checkbox
                      id="acknowledge-warning"
                      checked={acknowledged}
                      onCheckedChange={(checked) =>
                        setAcknowledged(checked === true)
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
                {accepted && (
                  <p
                    className="flex items-center gap-2 text-sm font-medium text-success-foreground"
                    role="status"
                  >
                    <IconCheck className="size-4" /> Schedule accepted. The
                    production run is ready.
                  </p>
                )}
              </CardContent>
              <CardFooter className="gap-2">
                {accepted ? (
                  <Button
                    className="w-full"
                    onClick={() => onAccepted(proposal.productionShiftId)}
                  >
                    Open production board{" "}
                    <IconArrowRight data-icon="inline-end" />
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={accept}
                    disabled={
                      busy !== null ||
                      (blockingWarnings.length > 0 && !acknowledged)
                    }
                  >
                    {busy === "accept" ? "Accepting…" : "Accept exact proposal"}
                  </Button>
                )}
              </CardFooter>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
