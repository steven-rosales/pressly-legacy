import type {
  ProductionBatch,
  ProductionPendingPlacement,
  StageRun,
} from "@pressly/contracts/production"
import type { TFunction } from "i18next"

type PendingRunPlacement = Extract<
  ProductionPendingPlacement,
  { status: "awaiting_run" | "ambiguous_run" }
>

export const presentPendingPlacementMessage = (
  placement: PendingRunPlacement,
  t: TFunction
): string => {
  if (placement.status === "ambiguous_run")
    return t("production.placementMultipleRuns")
  return placement.reason === "no_started_run"
    ? t("production.placementNoRun")
    : t("production.placementNotAttempted")
}

export const localeForLanguage = (
  language: string | undefined
): "en-US" | "es-US" =>
  language?.startsWith("es") === true ? "es-US" : "en-US"

export const productionStages = [
  "sorting",
  "washing",
  "drying",
  "folding_packaging",
] as const

export type ProductionStageKind = (typeof productionStages)[number]

export const productionStageLabels: Record<ProductionStageKind, string> = {
  sorting: "Sorting",
  washing: "Washing",
  drying: "Drying",
  folding_packaging: "Folding & packaging",
}

export const selectDefaultStage = (
  batches: readonly ProductionBatch[]
): ProductionStageKind => {
  const stages = batches.flatMap((batch) => batch.stages)
  return (
    productionStages.find((kind) =>
      stages.some((stage) => stage.stage === kind && stage.status === "started")
    ) ??
    productionStages.find((kind) =>
      stages.some(
        (stage) =>
          stage.stage === kind &&
          (stage.nextAction.state === "available" ||
            stage.nextAction.state === "confirmation_required")
      )
    ) ??
    "sorting"
  )
}

export type StagePresentation = Readonly<{
  state:
    | "completed"
    | "ready"
    | "needs_machines"
    | "waiting"
    | "upcoming"
    | "in_progress"
  labelKey:
    | "production.statusCompleted"
    | "production.readyToStart"
    | "production.readyToComplete"
    | "production.scheduledToStart"
    | "production.inProgress"
    | "production.needsMachines"
    | "production.waitingPrevious"
    | "production.resourceOccupied"
    | "production.upcoming"
    | "production.waitingForRun"
  detailKey:
    | "production.serverAuthorized"
    | "production.startIfReady"
    | "production.earlyConfirmation"
    | "production.stageNeedsMachinesDetail"
    | "production.stagePreviousIncompleteDetail"
    | "production.stageKindActiveDetail"
    | "production.stageMachineOverlapDetail"
    | "production.stageRunNotStartedDetail"
    | null
  action: "start" | "complete" | null
  availableAt: number | null
}>

const dateKey = (value: string | number, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  }).formatToParts(new Date(value))
  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""
  return `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`
}

const timeFormatter = (timeZone: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  })

const dateFormatter = (timeZone: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone,
  })

export const formatMoment = (
  value: string,
  reference: string,
  timeZone: string,
  locale = "en-US"
): string => {
  const time = timeFormatter(timeZone, locale).format(new Date(value))
  return dateKey(value, timeZone) === dateKey(reference, timeZone)
    ? time
    : `${dateFormatter(timeZone, locale).format(new Date(value))} · ${time}`
}

export const formatStageWindow = (
  startsAt: string,
  endsAt: string,
  reference: string,
  timeZone: string,
  locale = "en-US"
): string => {
  const startTime = timeFormatter(timeZone, locale).format(new Date(startsAt))
  const endTime = timeFormatter(timeZone, locale).format(new Date(endsAt))
  const startDay = dateKey(startsAt, timeZone)
  const endDay = dateKey(endsAt, timeZone)
  const referenceDay = dateKey(reference, timeZone)

  if (startDay === referenceDay && endDay === referenceDay)
    return `${startTime}–${endTime}`

  const startDate = dateFormatter(timeZone, locale).format(new Date(startsAt))
  if (startDay === endDay) return `${startDate} · ${startTime}–${endTime}`

  const endDate = dateFormatter(timeZone, locale).format(new Date(endsAt))
  return `${startDate} · ${startTime}–${endDate} · ${endTime}`
}

export const formatCountdown = (
  target: number,
  now: number,
  t?: TFunction
): string => {
  const remainingSeconds = Math.max(0, Math.ceil((target - now) / 1_000))
  if (remainingSeconds === 0)
    return t?.("production.checkReadiness") ?? "Checking readiness…"
  if (remainingSeconds < 60)
    return (
      t?.("production.secondsRemaining", { seconds: remainingSeconds }) ??
      `${remainingSeconds}s remaining`
    )

  const hours = Math.floor(remainingSeconds / 3_600)
  const minutes = Math.ceil((remainingSeconds % 3_600) / 60)
  if (hours === 0)
    return (
      t?.("production.minutesRemaining", { minutes }) ?? `${minutes}m remaining`
    )
  if (minutes === 0)
    return t?.("production.hoursRemaining", { hours }) ?? `${hours}h remaining`
  return (
    t?.("production.hoursMinutesRemaining", { hours, minutes }) ??
    `${hours}h ${minutes}m remaining`
  )
}

export const completionBoundary = (stage: StageRun): number | null => {
  if (stage.status !== "started" || stage.actualStartAt === null) return null
  const plannedStart = Date.parse(stage.plannedStartAt)
  const plannedEnd = Date.parse(stage.plannedEndAt)
  const actualDurationEnd =
    Date.parse(stage.actualStartAt) + Math.max(0, plannedEnd - plannedStart)
  return Math.max(plannedEnd, actualDurationEnd)
}

export const presentStage = ({
  stage,
  now,
}: Readonly<{
  stage: StageRun
  now: number
}>): StagePresentation => {
  if (stage.nextAction.state === "terminal")
    return {
      state: "completed",
      labelKey: "production.statusCompleted",
      detailKey: null,
      action: null,
      availableAt: null,
    }

  if (stage.nextAction.state === "available")
    return {
      state: "ready",
      labelKey:
        stage.nextAction.action === "start"
          ? "production.readyToStart"
          : "production.readyToComplete",
      detailKey: "production.serverAuthorized",
      action: stage.nextAction.action,
      availableAt: null,
    }

  if (
    stage.nextAction.state === "confirmation_required" &&
    stage.nextAction.action === "start"
  )
    return {
      state: "upcoming",
      labelKey: "production.scheduledToStart",
      detailKey: "production.startIfReady",
      action: "start",
      availableAt: Date.parse(stage.nextAction.availableAt),
    }

  if (stage.nextAction.state === "confirmation_required")
    return {
      state: "in_progress",
      labelKey: "production.inProgress",
      detailKey: "production.earlyConfirmation",
      action: "complete",
      availableAt: Date.parse(stage.nextAction.availableAt),
    }

  const blocked = stage.nextAction
  if (blocked.code === "MACHINE_ASSIGNMENT_REQUIRED")
    return {
      state: "needs_machines",
      labelKey: "production.needsMachines",
      detailKey: "production.stageNeedsMachinesDetail",
      action: null,
      availableAt: null,
    }

  if (blocked.code === "PREVIOUS_STAGE_INCOMPLETE")
    return {
      state: "waiting",
      labelKey: "production.waitingPrevious",
      detailKey: "production.stagePreviousIncompleteDetail",
      action: null,
      availableAt: null,
    }

  if (blocked.code === "STAGE_KIND_ALREADY_ACTIVE")
    return {
      state: "waiting",
      labelKey: "production.resourceOccupied",
      detailKey: "production.stageKindActiveDetail",
      action: null,
      availableAt: null,
    }

  if (blocked.code === "MACHINE_ASSIGNMENT_OVERLAPS")
    return {
      state: "waiting",
      labelKey: "production.resourceOccupied",
      detailKey: "production.stageMachineOverlapDetail",
      action: null,
      availableAt: null,
    }

  const availableAt =
    blocked.availableAt === null ? null : Date.parse(blocked.availableAt)
  if (availableAt !== null && availableAt > now)
    return {
      state: blocked.action === "start" ? "upcoming" : "in_progress",
      labelKey:
        blocked.action === "start"
          ? "production.upcoming"
          : "production.inProgress",
      detailKey: "production.stageRunNotStartedDetail",
      action: null,
      availableAt,
    }

  return {
    state: "waiting",
    labelKey: "production.waitingForRun",
    detailKey: "production.stageRunNotStartedDetail",
    action: null,
    availableAt: null,
  }
}
