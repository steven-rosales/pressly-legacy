import type { ProductionBatch, StageRun } from "@pressly/contracts"

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
          stage.stage === kind && stage.nextAction.state === "available"
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
  label: string
  detail: string | null
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

const timeFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  })

const dateFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone,
  })

export const formatMoment = (
  value: string,
  reference: string,
  timeZone: string
): string => {
  const time = timeFormatter(timeZone).format(new Date(value))
  return dateKey(value, timeZone) === dateKey(reference, timeZone)
    ? time
    : `${dateFormatter(timeZone).format(new Date(value))} · ${time}`
}

export const formatStageWindow = (
  startsAt: string,
  endsAt: string,
  reference: string,
  timeZone: string
): string => {
  const startTime = timeFormatter(timeZone).format(new Date(startsAt))
  const endTime = timeFormatter(timeZone).format(new Date(endsAt))
  const startDay = dateKey(startsAt, timeZone)
  const endDay = dateKey(endsAt, timeZone)
  const referenceDay = dateKey(reference, timeZone)

  if (startDay === referenceDay && endDay === referenceDay)
    return `${startTime}–${endTime}`

  const startDate = dateFormatter(timeZone).format(new Date(startsAt))
  if (startDay === endDay) return `${startDate} · ${startTime}–${endTime}`

  const endDate = dateFormatter(timeZone).format(new Date(endsAt))
  return `${startDate} · ${startTime}–${endDate} · ${endTime}`
}

export const formatCountdown = (target: number, now: number): string => {
  const remainingSeconds = Math.max(0, Math.ceil((target - now) / 1_000))
  if (remainingSeconds === 0) return "Checking readiness…"
  if (remainingSeconds < 60) return `${remainingSeconds}s remaining`

  const hours = Math.floor(remainingSeconds / 3_600)
  const minutes = Math.ceil((remainingSeconds % 3_600) / 60)
  if (hours === 0) return `${minutes}m remaining`
  if (minutes === 0) return `${hours}h remaining`
  return `${hours}h ${minutes}m remaining`
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
      label: "Completed",
      detail: null,
      action: null,
      availableAt: null,
    }

  if (stage.nextAction.state === "available")
    return {
      state: "ready",
      label:
        stage.nextAction.action === "start"
          ? "Ready to start"
          : "Ready to complete",
      detail: "Authorized by the server",
      action: stage.nextAction.action,
      availableAt: null,
    }

  if (stage.nextAction.state === "confirmation_required")
    return {
      state: "in_progress",
      label: "In progress",
      detail: "Completing before the planned pulse ends requires confirmation.",
      action: "complete",
      availableAt: Date.parse(stage.nextAction.availableAt),
    }

  const blocked = stage.nextAction
  if (blocked.code === "MACHINE_ASSIGNMENT_REQUIRED")
    return {
      state: "needs_machines",
      label: "Needs machines",
      detail: blocked.message,
      action: null,
      availableAt: null,
    }

  if (blocked.code === "PREVIOUS_STAGE_INCOMPLETE")
    return {
      state: "waiting",
      label: "Waiting for previous stage",
      detail: blocked.message,
      action: null,
      availableAt: null,
    }

  if (
    blocked.code === "STAGE_KIND_ALREADY_ACTIVE" ||
    blocked.code === "MACHINE_ASSIGNMENT_OVERLAPS"
  )
    return {
      state: "waiting",
      label: "Resource occupied",
      detail: blocked.message,
      action: null,
      availableAt: null,
    }

  const availableAt =
    blocked.availableAt === null ? null : Date.parse(blocked.availableAt)
  if (availableAt !== null && availableAt > now)
    return {
      state: blocked.action === "start" ? "upcoming" : "in_progress",
      label: blocked.action === "start" ? "Upcoming" : "In progress",
      detail: blocked.message,
      action: null,
      availableAt,
    }

  return {
    state: "waiting",
    label: "Waiting for server clearance",
    detail: blocked.message,
    action: null,
    availableAt: null,
  }
}
