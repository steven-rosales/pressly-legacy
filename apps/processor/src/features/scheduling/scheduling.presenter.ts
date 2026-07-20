import type {
  ProductionOrderSummary,
  ProductionWarning,
  ScheduleProposal,
} from "@pressly/contracts"
import type { TFunction } from "i18next"

export type ScheduleWarningPresentation = Readonly<{
  title: string
  detail: string
}>

export const presentSchedulingDueBucket = (
  bucket: ProductionOrderSummary["dueBucket"],
  t: TFunction
): string => {
  switch (bucket) {
    case "overdue":
      return t("common.due.overdue")
    case "today":
      return t("common.due.today")
    case "tomorrow":
      return t("common.due.tomorrow")
    case "later":
      return t("common.due.later")
  }
}

export const presentScheduleWarning = (
  warning: ProductionWarning,
  t: TFunction
): ScheduleWarningPresentation => {
  switch (warning.code) {
    case "SHIFT_OVERFLOW":
      return {
        title: t("scheduling.warningShiftOverflowTitle"),
        detail: t("scheduling.warningShiftOverflowDetail"),
      }
    case "OVERSIZED_ORDER":
      return {
        title: t("scheduling.warningOversizedTitle"),
        detail: t("scheduling.warningOversizedDetail", {
          count: warning.orderIds?.length ?? 0,
        }),
      }
    case "NO_ACTIVE_WASHERS":
      return {
        title: t("scheduling.warningNoWashersTitle"),
        detail: t("scheduling.warningNoWashersDetail"),
      }
    case "NO_ACTIVE_DRYERS":
      return {
        title: t("scheduling.warningNoDryersTitle"),
        detail: t("scheduling.warningNoDryersDetail"),
      }
    case "NO_FOLDING_CAPACITY":
      return {
        title: t("scheduling.warningNoFoldingTitle"),
        detail: t("scheduling.warningNoFoldingDetail"),
      }
  }
}

export const localeForLanguage = (
  language: string | undefined
): "en-US" | "es-US" =>
  language?.startsWith("es") === true ? "es-US" : "en-US"

const zonedParts = (value: Date, timeZone: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  )

export const formatZonedDateTimeInput = (
  iso: string,
  timeZone: string
): string => {
  const parts = zonedParts(new Date(iso), timeZone)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

const parseLocalDateTime = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (match === null)
    throw new TypeError("Enter a complete local date and time.")
  const [, year, month, day, hour, minute] = match
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  }
}

const offsetAt = (timestamp: number, timeZone: string): number => {
  const date = new Date(timestamp)
  const parts = zonedParts(date, timeZone)
  const representedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  )
  return representedAsUtc - Math.floor(timestamp / 1_000) * 1_000
}

export const zonedDateTimeInputToIso = (
  value: string,
  timeZone: string
): string => {
  const parts = parseLocalDateTime(value)
  const desiredAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute
  )
  let timestamp = desiredAsUtc
  for (let pass = 0; pass < 3; pass += 1)
    timestamp = desiredAsUtc - offsetAt(timestamp, timeZone)

  const iso = new Date(timestamp).toISOString()
  if (formatZonedDateTimeInput(iso, timeZone) !== value)
    throw new TypeError("That local time does not exist in this location.")
  return iso
}

export type ScheduleDemandSummary = Readonly<{
  label: "Planned demand" | "Ready demand"
  derivedWeightLbs: number
  bagCount: number
  orderCount: number
}>

export const summarizeScheduleDemand = (
  proposal: ScheduleProposal | null,
  orders: readonly ProductionOrderSummary[]
): ScheduleDemandSummary => {
  if (proposal !== null) {
    const orderIds = new Set(
      proposal.batches.flatMap((batch) => batch.orderIds)
    )
    return {
      label: "Planned demand",
      derivedWeightLbs: proposal.batches.reduce(
        (sum, batch) => sum + batch.derivedWeightLbs,
        0
      ),
      bagCount: proposal.batches.reduce(
        (sum, batch) => sum + batch.bagCount,
        0
      ),
      orderCount: orderIds.size,
    }
  }

  return {
    label: "Ready demand",
    derivedWeightLbs: orders.reduce(
      (sum, order) => sum + order.derivedWeightLbs,
      0
    ),
    bagCount: orders.reduce((sum, order) => sum + order.bagCount, 0),
    orderCount: orders.length,
  }
}

export type ScheduleLifecyclePresentation = Readonly<{
  state: "configuration_required" | "ready" | "dirty" | "draft" | "accepted"
  badge: string
  title: string
  description: string
  action: "configure" | "generate" | "accept" | "start"
  actionLabel: string
}>

export const presentScheduleLifecycle = ({
  proposal,
  dirty,
  configurationReady,
}: Readonly<{
  proposal: ScheduleProposal | null
  dirty: boolean
  configurationReady: boolean
}>): ScheduleLifecyclePresentation => {
  if (dirty && !configurationReady)
    return {
      state: "configuration_required",
      badge: "Setup required",
      title: "Publish a production configuration",
      description:
        "Scheduling uses the floor-tested pulse published in Configuration.",
      action: "configure",
      actionLabel: "Open configuration",
    }

  if (dirty)
    return {
      state: "dirty",
      badge: "Changes not computed",
      title: "Recompute the plan",
      description:
        "Shift settings, order priority, or ready demand changed after this plan was computed.",
      action: "generate",
      actionLabel: "Recompute schedule",
    }

  if (proposal?.status === "accepted")
    return {
      state: "accepted",
      badge: "Plan accepted",
      title: "Ready to start production",
      description:
        "Starting creates the production run after one final server check.",
      action: "start",
      actionLabel: "Start production run",
    }

  if (proposal !== null)
    return {
      state: "draft",
      badge: "Review plan",
      title: "Accept this exact proposal",
      description:
        "Review the timeline and warnings, then save this plan as the shift preference.",
      action: "accept",
      actionLabel: "Accept plan",
    }

  if (!configurationReady)
    return {
      state: "configuration_required",
      badge: "Setup required",
      title: "Publish a production configuration",
      description:
        "Scheduling uses the floor-tested pulse published in Configuration.",
      action: "configure",
      actionLabel: "Open configuration",
    }

  return {
    state: "ready",
    badge: "Ready to compute",
    title: "Build the shift plan",
    description: "Compute one proposal from every eligible order.",
    action: "generate",
    actionLabel: "Compute schedule",
  }
}
