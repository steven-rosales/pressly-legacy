import { IconClock } from "@tabler/icons-react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import type {
  ProductionStageStartTiming,
  StageRun,
} from "@pressly/contracts/production"
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
import { formatMoment, localeForLanguage } from "./production-board.presenter"

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
  const { t, i18n } = useTranslation()
  const locale = localeForLanguage(i18n.resolvedLanguage)
  const stageLabel =
    stage === null
      ? t("production.thisStage")
      : t(
          stage.stage === "sorting"
            ? "common.stage.sorting"
            : stage.stage === "washing"
              ? "common.stage.washing"
              : stage.stage === "drying"
                ? "common.stage.drying"
                : "common.stage.foldingPackaging"
        )
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
            {t("production.startStageNowTitle", { stage: stageLabel })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {stage === null || timing === null
              ? t("production.earlierThanPlanned")
              : t("production.earlyStartDescription", {
                  time: formatMoment(
                    timing.plannedStartAt,
                    referenceAt,
                    timezone,
                    locale
                  ),
                  remaining: formatDuration(timing.remainingMilliseconds, t),
                })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {t("production.notYet")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault()
              onConfirm()
            }}
          >
            {busy && <Spinner data-icon="inline-start" />}
            {t("production.startNowShort")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const formatDuration = (milliseconds: number, t: TFunction): string => {
  const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60_000))
  if (totalMinutes < 60)
    return t("common.minutesShort", { minutes: totalMinutes })
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0
    ? t("production.hoursShort", { hours })
    : t("production.hoursMinutesShort", { hours, minutes })
}
