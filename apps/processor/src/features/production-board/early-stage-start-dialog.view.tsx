import { IconClock } from "@tabler/icons-react"
import type { ProductionStageStartTiming, StageRun } from "@pressly/contracts"
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
import { Spinner } from "@/components/ui/spinner"
import {
  formatMoment,
  productionStageLabels,
} from "./production-board.presenter"

export function EarlyStageStartDialog({
  stage,
  timing,
  referenceAt,
  timezone,
  busy,
  onOpenChange,
  onConfirm,
}: Readonly<{
  stage: StageRun | null
  timing: ProductionStageStartTiming | null
  referenceAt: string
  timezone: string
  busy: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}>) {
  return (
    <AlertDialog
      open={stage !== null && timing !== null}
      onOpenChange={onOpenChange}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-warning text-warning-foreground">
            <IconClock />
          </AlertDialogMedia>
          <AlertDialogTitle>
            Start{" "}
            {stage === null ? "this stage" : productionStageLabels[stage.stage]}{" "}
            now?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {stage === null || timing === null
              ? "This stage is earlier than planned."
              : `It is planned for ${formatMoment(timing.plannedStartAt, referenceAt, timezone)}, ${formatDuration(timing.remainingMilliseconds)} from now. Start only if the batch is physically ready. The original plan will not change.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Not yet</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault()
              onConfirm()
            }}
          >
            {busy && <Spinner data-icon="inline-start" />}
            Start now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const formatDuration = (milliseconds: number): string => {
  const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60_000))
  if (totalMinutes < 60) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`
}
