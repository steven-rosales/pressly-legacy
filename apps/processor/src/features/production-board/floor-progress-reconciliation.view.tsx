import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { IconAlertTriangle, IconCheck, IconHistory } from "@tabler/icons-react"
import type {
  ProductionBatch,
  ProductionBatchProgressReconciliationConfirmationRequiredResult,
  ProductionFloorProgressReason,
  ProductionFloorProgressTarget,
  ProductionMachine,
} from "@pressly/contracts/production"
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
  forwardMilestones,
  milestoneForBatch,
  targetForMilestone,
  targetRequiresMachines,
  type FloorProgressDraft,
} from "./floor-progress.presenter"

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
  const { t } = useTranslation()
  const milestoneLabel = (value: string) =>
    value === "waiting_to_sort"
      ? t("floorProgress.waitingToSort")
      : value === "sorting_started"
        ? t("floorProgress.sorting")
        : value === "sorting_completed"
          ? t("floorProgress.waitingToWash")
          : value === "washing_started"
            ? t("floorProgress.washing")
            : value === "washing_completed"
              ? t("floorProgress.waitingToDry")
              : value === "drying_started"
                ? t("floorProgress.drying")
                : value === "drying_completed"
                  ? t("floorProgress.waitingToFold")
                  : value === "folding_packaging_started"
                    ? t("floorProgress.foldingPackaging")
                    : t("floorProgress.finished")
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
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        size="workspace"
        closeLabel={t("common.close")}
      >
        <SheetHeader className="border-b px-4 pe-16 pb-4">
          <SheetTitle>{t("floorProgress.title")}</SheetTitle>
          <SheetDescription>{t("floorProgress.description")}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 px-4">
          <FieldGroup className="gap-5 pb-4">
            <Field>
              <FieldLabel htmlFor="floor-progress-batch">
                {t("floorProgress.batch")}
              </FieldLabel>
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
                    {t("floorProgress.batchOption", {
                      number: candidate.sequence + 1,
                      weight: candidate.derivedWeightLbs,
                    })}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {batch !== undefined && (
                <FieldDescription className="flex items-center gap-2">
                  {t("floorProgress.currentRecord")}
                  <Badge variant="outline">
                    {milestoneLabel(milestoneForBatch(batch))}
                  </Badge>
                </FieldDescription>
              )}
            </Field>

            <FieldSet>
              <FieldLegend>{t("floorProgress.currentFloorState")}</FieldLegend>
              {milestones.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("floorProgress.alreadyFinished")}
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
                          {milestoneLabel(option)}
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
                <AlertTitle>{t("floorProgress.reviewChange")}</AlertTitle>
                <AlertDescription>
                  {describeFloorProgressChange(batch, target, t)}
                </AlertDescription>
              </Alert>
            )}

            {batch !== undefined && milestone === "finished" && (
              <Alert className="border-warning-foreground/20 bg-warning text-warning-foreground">
                <IconAlertTriangle />
                <AlertTitle>
                  {t("floorProgress.finishedConsequences")}
                </AlertTitle>
                <AlertDescription>
                  {describeFinishedConsequences(batch, batches, t)}
                </AlertDescription>
              </Alert>
            )}

            {batch !== undefined &&
              target !== null &&
              activeStage !== null &&
              requiresMachines && (
                <FieldSet>
                  <FieldLegend>
                    {t("floorProgress.machines", {
                      stage: t(
                        activeStage === "washing"
                          ? "common.stage.washing"
                          : "common.stage.drying"
                      ),
                    })}
                  </FieldLegend>
                  <FieldDescription>
                    {t("floorProgress.machineHelp")}
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
                      <AlertTitle>{t("floorProgress.noMachines")}</AlertTitle>
                      <AlertDescription>
                        {t("floorProgress.noMachinesDescription")}
                      </AlertDescription>
                    </Alert>
                  )}
                </FieldSet>
              )}

            <Field>
              <FieldLabel htmlFor="floor-progress-reason">
                {t("floorProgress.whyBehind")}
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
                {(
                  [
                    ["lpms_unavailable", t("floorProgress.lpmsUnavailable")],
                    ["updates_missed", t("floorProgress.updatesMissed")],
                    ["other", t("floorProgress.somethingElse")],
                  ] as const
                ).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="floor-progress-note">
                {t("floorProgress.note")}
                {reason === "other" ? "" : ` (${t("floorProgress.optional")})`}
              </FieldLabel>
              <Textarea
                id="floor-progress-note"
                value={note}
                disabled={locked}
                maxLength={500}
                placeholder={t("floorProgress.notePlaceholder")}
                onChange={(event) => setNote(event.target.value)}
              />
              {missingOtherNote && (
                <FieldDescription>
                  {t("floorProgress.otherNoteRequired")}
                </FieldDescription>
              )}
            </Field>

            {confirmation !== null && (
              <Alert className="border-warning-foreground/20 bg-warning text-warning-foreground">
                <IconCheck />
                <AlertTitle>{t("floorProgress.ready")}</AlertTitle>
                <AlertDescription>
                  {t("floorProgress.readyDescription", {
                    queue: confirmation.queueVersion,
                    batch:
                      batch?.sequence === undefined ? "" : batch.sequence + 1,
                  })}
                </AlertDescription>
              </Alert>
            )}

            {error !== null && (
              <Alert variant="destructive" role="alert">
                <IconAlertTriangle />
                <AlertTitle>{t("floorProgress.failed")}</AlertTitle>
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
              {confirmation === null
                ? t("floorProgress.keepCurrent")
                : t("floorProgress.changeDetails")}
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
              {confirmation === null
                ? t("floorProgress.review")
                : t("floorProgress.confirm")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
