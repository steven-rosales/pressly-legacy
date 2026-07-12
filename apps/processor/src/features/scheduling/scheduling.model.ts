import { useMemo, useState } from "react"
import type {
  ProductionOrderSummary,
  ProductionShift,
  ScheduleProposal,
  SchedulerConfig,
} from "@pressly/contracts"
import type { ProductionPort } from "@/ports/production.port"
import type { IdempotencyPort } from "@/ports/idempotency.port"
import { RequestFailure } from "@/ports/request.error"
import {
  formatZonedDateTimeInput,
  zonedDateTimeInputToIso,
} from "./scheduling.presenter"

export type SchedulingDefaults = Readonly<{
  pulseMinutes: number
  foldLbsPerFolderMinute: number
  effectiveFolderCount: number
  startsAt: string
  endsAt: string
  timezone: string
  horizonEnd: string
}>

export type SchedulingModelInput = Readonly<{
  production: ProductionPort
  idempotency: IdempotencyPort
  locationId: string
  orders: readonly ProductionOrderSummary[]
  defaults: SchedulingDefaults
  currentConfig?: SchedulerConfig | null
  currentShift?: ProductionShift | null
  initialProposal?: ScheduleProposal
}>

const messageFor = (error: unknown) =>
  error instanceof RequestFailure
    ? error.message
    : error instanceof TypeError
      ? error.message
      : "The schedule could not be updated. Try again."

type StageFitAssertionKey = "sortingFits" | "washingFits" | "dryingFits"

const confirmedStageFitAssertion = (assertions: {
  sortingFits: boolean
  washingFits: boolean
  dryingFits: boolean
}) => {
  if (
    !assertions.sortingFits ||
    !assertions.washingFits ||
    !assertions.dryingFits
  )
    throw new TypeError(
      "Confirm that sorting, washing, and drying each fit inside the pulse."
    )

  return {
    sortingFits: true,
    washingFits: true,
    dryingFits: true,
  } as const
}

export function useSchedulingModel(input: SchedulingModelInput) {
  const [proposal, setProposal] = useState<ScheduleProposal | null>(
    input.initialProposal ?? null
  )
  const [pulseMinutes, setPulseMinutes] = useState(input.defaults.pulseMinutes)
  const [foldRate, setFoldRate] = useState(
    input.defaults.foldLbsPerFolderMinute
  )
  const [folders, setFolders] = useState(input.defaults.effectiveFolderCount)
  const [shiftStartsAt, setShiftStartsAt] = useState(() =>
    formatZonedDateTimeInput(input.defaults.startsAt, input.defaults.timezone)
  )
  const [shiftEndsAt, setShiftEndsAt] = useState(() =>
    formatZonedDateTimeInput(input.defaults.endsAt, input.defaults.timezone)
  )
  const [horizonEnd, setHorizonEnd] = useState(() =>
    formatZonedDateTimeInput(input.defaults.horizonEnd, input.defaults.timezone)
  )
  const [priorityIds, setPriorityIds] = useState(
    () =>
      new Set(
        input.orders.filter((order) => order.priority).map(({ id }) => id)
      )
  )
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState<"generate" | "accept" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const currentConfigMatchesDefaults =
    input.currentConfig !== null &&
    input.currentConfig !== undefined &&
    input.currentConfig.pulseMinutes === input.defaults.pulseMinutes &&
    input.currentConfig.foldLbsPerFolderMinute ===
      input.defaults.foldLbsPerFolderMinute
  const [stageFitAssertions, setStageFitAssertions] = useState({
    sortingFits: currentConfigMatchesDefaults,
    washingFits: currentConfigMatchesDefaults,
    dryingFits: currentConfigMatchesDefaults,
  })
  const stageFitConfirmed =
    stageFitAssertions.sortingFits &&
    stageFitAssertions.washingFits &&
    stageFitAssertions.dryingFits

  const blockingWarnings =
    proposal?.warnings.filter((warning) => warning.blocking) ?? []
  const totalLbs = useMemo(
    () => input.orders.reduce((sum, order) => sum + order.derivedWeightLbs, 0),
    [input.orders]
  )
  const totalBags = useMemo(
    () => input.orders.reduce((sum, order) => sum + order.bagCount, 0),
    [input.orders]
  )

  const generate = async () => {
    setBusy("generate")
    setError(null)
    try {
      if (pulseMinutes <= 0 || foldRate <= 0 || folders <= 0) {
        setError("Enter positive scheduler capacity before computing.")
        return
      }
      const stageFitAssertion = confirmedStageFitAssertion(stageFitAssertions)
      const startsAt = zonedDateTimeInputToIso(
        shiftStartsAt,
        input.defaults.timezone
      )
      const endsAt = zonedDateTimeInputToIso(
        shiftEndsAt,
        input.defaults.timezone
      )
      const parsedHorizonEnd = zonedDateTimeInputToIso(
        horizonEnd,
        input.defaults.timezone
      )
      if (Date.parse(endsAt) <= Date.parse(startsAt)) {
        setError("Shift end must be after shift start.")
        return
      }
      if (Date.parse(parsedHorizonEnd) <= Date.parse(startsAt)) {
        setError("Planning horizon must be after shift start.")
        return
      }

      const config =
        input.currentConfig !== null &&
        input.currentConfig !== undefined &&
        input.currentConfig.pulseMinutes === pulseMinutes &&
        input.currentConfig.foldLbsPerFolderMinute === foldRate
          ? input.currentConfig
          : await input.production.publishConfig({
              locationId: input.locationId,
              pulseMinutes,
              foldLbsPerFolderMinute: foldRate,
              stageFitAssertion,
              idempotencyKey: await input.idempotency.key({
                operation: "publish-scheduler-config",
                payload: {
                  locationId: input.locationId,
                  pulseMinutes,
                  foldLbsPerFolderMinute: foldRate,
                  stageFitAssertion,
                },
              }),
            })
      const shift =
        input.currentShift !== null &&
        input.currentShift !== undefined &&
        input.currentShift.startsAt === startsAt &&
        input.currentShift.endsAt === endsAt &&
        input.currentShift.timezone === input.defaults.timezone &&
        input.currentShift.effectiveFolderCount === folders
          ? input.currentShift
          : await input.production.createShift({
              locationId: input.locationId,
              startsAt,
              endsAt,
              timezone: input.defaults.timezone,
              effectiveFolderCount: folders,
              idempotencyKey: await input.idempotency.key({
                operation: "create-production-shift",
                payload: {
                  locationId: input.locationId,
                  startsAt,
                  endsAt,
                  timezone: input.defaults.timezone,
                  effectiveFolderCount: folders,
                },
              }),
            })
      setProposal(
        await input.production.createSchedule({
          locationId: input.locationId,
          productionShiftId: shift.id,
          schedulerConfigId: config.id,
          horizonEnd: parsedHorizonEnd,
        })
      )
      setAcknowledged(false)
      setAccepted(false)
    } catch (cause) {
      setError(messageFor(cause))
    } finally {
      setBusy(null)
    }
  }

  const togglePriority = async (
    orderId: string,
    version: number,
    priority: boolean
  ) => {
    const next = new Set(priorityIds)
    if (priority) next.add(orderId)
    else next.delete(orderId)
    setPriorityIds(next)
    try {
      await input.production.setPriority({
        locationId: input.locationId,
        productionOrderId: orderId,
        priority,
        expectedVersion: version,
        idempotencyKey: await input.idempotency.key({
          operation: "set-order-priority",
          payload: {
            locationId: input.locationId,
            productionOrderId: orderId,
            expectedVersion: version,
            priority,
          },
        }),
      })
    } catch (cause) {
      setPriorityIds(priorityIds)
      setError(messageFor(cause))
    }
  }

  const updatePulseMinutes = (value: number) => {
    if (value !== pulseMinutes)
      setStageFitAssertions({
        sortingFits: false,
        washingFits: false,
        dryingFits: false,
      })
    setPulseMinutes(value)
  }

  const setStageFitAssertion = (
    assertion: StageFitAssertionKey,
    confirmed: boolean
  ) =>
    setStageFitAssertions((current) => ({
      ...current,
      [assertion]: confirmed,
    }))

  const accept = async () => {
    if (proposal === null) return
    setBusy("accept")
    setError(null)
    try {
      const acknowledgedWarningCodes = acknowledged
        ? blockingWarnings.map((warning) => warning.code).sort()
        : []
      await input.production.acceptSchedule({
        locationId: input.locationId,
        scheduleRunId: proposal.scheduleRunId,
        expectedOutputPlanHash: proposal.outputPlanHash,
        acknowledgedWarningCodes,
        idempotencyKey: await input.idempotency.key({
          operation: "accept-schedule",
          payload: {
            locationId: input.locationId,
            scheduleRunId: proposal.scheduleRunId,
            expectedOutputPlanHash: proposal.outputPlanHash,
            acknowledgedWarningCodes,
          },
        }),
      })
      setAccepted(true)
    } catch (cause) {
      setError(messageFor(cause))
    } finally {
      setBusy(null)
    }
  }

  return {
    proposal,
    orders: input.orders,
    pulseMinutes,
    setPulseMinutes: updatePulseMinutes,
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
  }
}

export type SchedulingModel = ReturnType<typeof useSchedulingModel>
