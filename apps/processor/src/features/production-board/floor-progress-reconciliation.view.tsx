import { useMemo, useState } from "react"
import { IconAlertTriangle, IconCheck, IconHistory } from "@tabler/icons-react"
import type {
  ProductionBatch,
  ProductionBatchProgressReconciliationConfirmationRequiredResult,
  ProductionFloorProgressReason,
  ProductionFloorProgressTarget,
  ProductionMachine,
} from "@pressly/contracts"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
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
import { Textarea } from "@/components/ui/textarea"
import {
  activeStageForTarget,
  describeFinishedConsequences,
  describeFloorProgressChange,
  floorProgressMilestoneLabels,
  floorProgressReasonLabels,
  forwardMilestones,
  milestoneForBatch,
  targetForMilestone,
  targetRequiresMachines,
  type FloorProgressDraft,
} from "./floor-progress.presenter"
import { productionStageLabels } from "./production-board.presenter"

export function FloorProgressReconciliationSheet({
  open,
  isMobile,
  batches,
  machines,
  busy,
  error,
  confirmation,
  onOpenChange,
  onSubmit,
  onConfirm,
  onInvalidateConfirmation,
}: Readonly<{
  open: boolean
  isMobile: boolean
  batches: readonly ProductionBatch[]
  machines: readonly ProductionMachine[]
  busy: boolean
  error: string | null
  confirmation: ProductionBatchProgressReconciliationConfirmationRequiredResult | null
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: FloorProgressDraft) => void
  onConfirm: () => void
  onInvalidateConfirmation: () => void
}>) {
  const defaultBatchId =
    batches.find((batch) => milestoneForBatch(batch) !== "finished")?.id ??
    batches[0]?.id ??
    ""
  const [batchId, setBatchId] = useState(defaultBatchId)
  const [milestone, setMilestone] = useState<
    ProductionFloorProgressTarget | ""
  >("")
  const [reason, setReason] =
    useState<ProductionFloorProgressReason>("updates_missed")
  const [note, setNote] = useState("")
  const [machineIds, setMachineIds] = useState<readonly string[]>([])

  const batch = batches.find((candidate) => candidate.id === batchId)
  const milestones = batch === undefined ? [] : forwardMilestones(batch)
  const target = milestone === "" ? null : targetForMilestone(milestone)
  const activeStage = target === null ? null : activeStageForTarget(target)
  const compatibleMachines = useMemo(
    () =>
      target === null
        ? []
        : machines.filter(
            (machine) => machine.active && machine.stationKind === activeStage
          ),
    [activeStage, machines, target]
  )
  const requiresMachines = target !== null && targetRequiresMachines(target)
  const validMachineIds = requiresMachines
    ? machineIds.filter((machineId) =>
        compatibleMachines.some((machine) => machine.id === machineId)
      )
    : []

  const locked = busy || confirmation !== null
  const missingOtherNote = reason === "other" && note.trim() === ""

  const canSubmit =
    batch !== undefined &&
    target !== null &&
    (!requiresMachines || validMachineIds.length > 0) &&
    !missingOtherNote &&
    !busy

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? "bottom" : "right"} size="workspace">
        <SheetHeader className="border-b px-4 pe-16 pb-4">
          <SheetTitle>Record floor progress</SheetTitle>
          <SheetDescription>
            Use this when the board is behind what physically happened. Planned
            times stay unchanged, and missed event times remain unrecorded.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 px-4">
          <FieldGroup className="gap-5 pb-4">
            <Field>
              <FieldLabel htmlFor="floor-progress-batch">Batch</FieldLabel>
              <NativeSelect
                id="floor-progress-batch"
                className="w-full [&_[data-slot=native-select]]:h-11"
                value={batchId}
                disabled={locked}
                onChange={(event) => {
                  setBatchId(event.target.value)
                  setMilestone("")
                  setMachineIds([])
                }}
              >
                {batches.map((candidate) => (
                  <NativeSelectOption key={candidate.id} value={candidate.id}>
                    Batch {candidate.sequence + 1} ·{" "}
                    {candidate.derivedWeightLbs} lb
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {batch !== undefined && (
                <FieldDescription className="flex items-center gap-2">
                  Current record
                  <Badge variant="outline">
                    {floorProgressMilestoneLabels[milestoneForBatch(batch)]}
                  </Badge>
                </FieldDescription>
              )}
            </Field>

            <FieldSet>
              <FieldLegend>Current floor state</FieldLegend>
              {milestones.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This batch is already recorded as finished.
                </p>
              ) : (
                <RadioGroup
                  value={milestone}
                  disabled={locked}
                  onValueChange={(value) => {
                    const nextTarget = value as ProductionFloorProgressTarget
                    const nextStage = activeStageForTarget(nextTarget)
                    const nextStageRun = batch?.stages.find(
                      (stage) => stage.stage === nextStage
                    )
                    setMilestone(nextTarget)
                    setMachineIds(
                      targetRequiresMachines(nextTarget)
                        ? (nextStageRun?.machineIds.filter((machineId) =>
                            machines.some(
                              (machine) =>
                                machine.id === machineId &&
                                machine.active &&
                                machine.stationKind === nextStage
                            )
                          ) ?? [])
                        : []
                    )
                  }}
                >
                  {milestones.map((option) => (
                    <FieldLabel
                      key={option}
                      htmlFor={`floor-progress-${option}`}
                    >
                      <Field
                        orientation="horizontal"
                        className="min-h-11 px-3 py-2"
                      >
                        <RadioGroupItem
                          id={`floor-progress-${option}`}
                          value={option}
                        />
                        <span className="text-sm font-medium">
                          {floorProgressMilestoneLabels[option]}
                        </span>
                      </Field>
                    </FieldLabel>
                  ))}
                </RadioGroup>
              )}
            </FieldSet>

            {batch !== undefined && target !== null && (
              <Alert>
                <IconHistory />
                <AlertTitle>Review the recorded change</AlertTitle>
                <AlertDescription>
                  {describeFloorProgressChange(batch, target)}
                </AlertDescription>
              </Alert>
            )}

            {batch !== undefined && milestone === "finished" && (
              <Alert className="border-warning-foreground/20 bg-warning text-warning-foreground">
                <IconAlertTriangle />
                <AlertTitle>Finished consequences</AlertTitle>
                <AlertDescription>
                  {describeFinishedConsequences(batch, batches)}
                </AlertDescription>
              </Alert>
            )}

            {batch !== undefined &&
              target !== null &&
              activeStage !== null &&
              requiresMachines && (
                <FieldSet>
                  <FieldLegend>
                    {productionStageLabels[activeStage]} machines
                  </FieldLegend>
                  <FieldDescription>
                    Select the machines this batch is using now. Historical
                    machine use stays unrecorded.
                  </FieldDescription>
                  <FieldGroup className="gap-2">
                    {compatibleMachines.map((machine) => (
                      <Field
                        key={machine.id}
                        orientation="horizontal"
                        className="min-h-11 rounded-lg border px-3 py-2"
                      >
                        <Checkbox
                          id={`floor-progress-machine-${machine.id}`}
                          checked={validMachineIds.includes(machine.id)}
                          disabled={locked}
                          onCheckedChange={(checked) =>
                            setMachineIds(() =>
                              checked === true
                                ? [...new Set([...validMachineIds, machine.id])]
                                : validMachineIds.filter(
                                    (id) => id !== machine.id
                                  )
                            )
                          }
                        />
                        <FieldLabel
                          htmlFor={`floor-progress-machine-${machine.id}`}
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
                  {compatibleMachines.length === 0 && (
                    <Alert>
                      <IconAlertTriangle />
                      <AlertTitle>No active compatible machines</AlertTitle>
                      <AlertDescription>
                        Add or activate a compatible machine before recording
                        this stage as active.
                      </AlertDescription>
                    </Alert>
                  )}
                </FieldSet>
              )}

            <Field>
              <FieldLabel htmlFor="floor-progress-reason">
                Why is the board behind?
              </FieldLabel>
              <NativeSelect
                id="floor-progress-reason"
                className="w-full [&_[data-slot=native-select]]:h-11"
                value={reason}
                disabled={locked}
                onChange={(event) =>
                  setReason(event.target.value as ProductionFloorProgressReason)
                }
              >
                {Object.entries(floorProgressReasonLabels).map(
                  ([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  )
                )}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="floor-progress-note">
                Note{reason === "other" ? "" : " (optional)"}
              </FieldLabel>
              <Textarea
                id="floor-progress-note"
                value={note}
                disabled={locked}
                maxLength={500}
                placeholder="Anything the next operator should know"
                onChange={(event) => setNote(event.target.value)}
              />
              {missingOtherNote && (
                <FieldDescription>
                  Add a short note when the reason is Something else.
                </FieldDescription>
              )}
            </Field>

            {confirmation !== null && (
              <Alert className="border-warning-foreground/20 bg-warning text-warning-foreground">
                <IconCheck />
                <AlertTitle>Ready to record</AlertTitle>
                <AlertDescription>
                  The server rechecked queue v{confirmation.queueVersion}, Batch{" "}
                  {batch?.sequence === undefined ? "" : batch.sequence + 1}, and
                  all four stage versions. Confirm to make this the floor
                  record.
                </AlertDescription>
              </Alert>
            )}

            {error !== null && (
              <Alert variant="destructive" role="alert">
                <IconAlertTriangle />
                <AlertTitle>Progress not recorded</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </ScrollArea>

        <SheetFooter className="border-t">
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={busy}
              onClick={() =>
                confirmation === null
                  ? onOpenChange(false)
                  : onInvalidateConfirmation()
              }
            >
              {confirmation === null ? "Keep current record" : "Change details"}
            </Button>
            <Button
              type="button"
              className="h-11"
              disabled={!canSubmit}
              aria-busy={busy}
              onClick={() => {
                if (confirmation !== null) {
                  onConfirm()
                  return
                }
                if (batch === undefined || target === null) return
                onSubmit({
                  productionBatchId: batch.id,
                  target,
                  reason,
                  note: note.trim() === "" ? null : note.trim(),
                  machineIds: validMachineIds,
                })
              }}
            >
              {busy ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <IconCheck data-icon="inline-start" />
              )}
              {confirmation === null ? "Review progress" : "Confirm and record"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
