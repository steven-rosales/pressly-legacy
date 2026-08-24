import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { ProcessorProductionOrderSummary } from "../../contracts/production-workspace.ts"
import type {
  ProductionShift,
  ProductionShiftSelection,
  ScheduleProposal,
  SchedulerConfig,
} from "@pressly/production-system/contracts/read-models/production-schedule"
import type { StartScheduleResult } from "@pressly/production-system/contracts/scheduling/start-schedule"
import type { ProductionPort } from "../../capabilities/production.port"
import type { IdempotencyPort } from "../../capabilities/idempotency.port"
import { presentSchedulingError } from "./scheduling.error.presenter"
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
}>

export type SchedulingModelInput = Readonly<{
  production: ProductionPort
  idempotency: IdempotencyPort
  locationId: string
  orders: readonly ProcessorProductionOrderSummary[]
  defaults: SchedulingDefaults
  currentConfig?: SchedulerConfig | null
  currentShift?: ProductionShift | null
  shiftSelection?: ProductionShiftSelection | null
  initialProposal?: ScheduleProposal
  canManage: boolean
  onOpenConfiguration?: () => void
  onScheduleChanged: (productionShiftId: string) => Promise<void>
  onStarted: (
    result: StartScheduleResult,
    productionShiftId: string
  ) => Promise<void>
}>

const initialPriorityIds = (
  orders: readonly ProcessorProductionOrderSummary[]
) => new Set(orders.filter((order) => order.priority).map(({ id }) => id))

const schedulingInputKey = ({
  folders,
  shiftStartsAt,
  shiftEndsAt,
  orders,
  priorityIds,
  selectedOrderIds,
}: Readonly<{
  folders: number
  shiftStartsAt: string
  shiftEndsAt: string
  orders: readonly ProcessorProductionOrderSummary[]
  priorityIds: ReadonlySet<string>
  selectedOrderIds: ReadonlySet<string>
}>): string =>
  JSON.stringify({
    folders,
    shiftStartsAt,
    shiftEndsAt,
    orders: orders
      .filter((order) => selectedOrderIds.has(order.id))
      .map((order) => `${order.id}:${order.version}`)
      .sort(),
    priorityIds: [...priorityIds]
      .filter((orderId) => selectedOrderIds.has(orderId))
      .sort(),
    selectedOrderIds: [...selectedOrderIds].sort(),
  })

const proposalMatchesVisibleDemand = (
  proposal: ScheduleProposal,
  orders: readonly ProcessorProductionOrderSummary[],
  selectedOrderIds: ReadonlySet<string>
): boolean => {
  const placedOrderIds = proposal.batches.flatMap((batch) => batch.orderIds)
  const proposalOrderIds = [...placedOrderIds, ...proposal.unplacedOrderIds]
    .sort()
    .join(":")
  const visibleOrderIds = orders
    .filter((order) => selectedOrderIds.has(order.id))
    .map((order) => order.id)
    .sort()
    .join(":")
  if (proposalOrderIds !== visibleOrderIds) return false

  const placed = new Set(placedOrderIds)
  const visiblePlacedOrders = orders.filter((order) => placed.has(order.id))
  const plannedWeight = proposal.batches.reduce(
    (sum, batch) => sum + batch.derivedWeightLbs,
    0
  )
  const plannedBags = proposal.batches.reduce(
    (sum, batch) => sum + batch.bagCount,
    0
  )
  return (
    visiblePlacedOrders.reduce(
      (sum, order) => sum + order.derivedWeightLbs,
      0
    ) === plannedWeight &&
    visiblePlacedOrders.reduce((sum, order) => sum + order.bagCount, 0) ===
      plannedBags
  )
}

export function useSchedulingModel(input: SchedulingModelInput) {
  const { t } = useTranslation()
  const initialShiftStartsAt = formatZonedDateTimeInput(
    input.defaults.startsAt,
    input.defaults.timezone
  )
  const initialShiftEndsAt = formatZonedDateTimeInput(
    input.defaults.endsAt,
    input.defaults.timezone
  )
  const initialPriorities = initialPriorityIds(input.orders)
  const initialSelectedOrderIds = new Set(
    input.shiftSelection?.selectedOrderIds ?? []
  )
  const [proposal, setProposal] = useState<ScheduleProposal | null>(
    input.initialProposal ?? null
  )
  const [folders, setFolders] = useState(input.defaults.effectiveFolderCount)
  const [shiftStartsAt, setShiftStartsAt] = useState(initialShiftStartsAt)
  const [shiftEndsAt, setShiftEndsAt] = useState(initialShiftEndsAt)
  const [priorityIds, setPriorityIds] = useState(initialPriorities)
  const [selectedOrderIds, setSelectedOrderIds] = useState(
    initialSelectedOrderIds
  )
  const [selectionVersion, setSelectionVersion] = useState(
    input.shiftSelection?.version ?? 0
  )
  const [selectionBusy, setSelectionBusy] = useState(false)
  const [pendingPriorityIds, setPendingPriorityIds] = useState<Set<string>>(
    () => new Set()
  )
  const knownOrderVersions = useRef(
    new Map(input.orders.map((order) => [order.id, order.version]))
  )
  const [computedInputKey, setComputedInputKey] = useState<string | null>(() =>
    input.initialProposal === undefined
      ? null
      : proposalMatchesVisibleDemand(
            input.initialProposal,
            input.orders,
            initialSelectedOrderIds
          )
        ? schedulingInputKey({
            folders: input.defaults.effectiveFolderCount,
            shiftStartsAt: initialShiftStartsAt,
            shiftEndsAt: initialShiftEndsAt,
            orders: input.orders,
            priorityIds: initialPriorities,
            selectedOrderIds: initialSelectedOrderIds,
          })
        : "stale-proposal:" + input.initialProposal.inputSnapshotHash
  )
  const [acknowledged, setAcknowledged] = useState(() => {
    const blockingCodes =
      input.initialProposal?.warnings
        .filter((warning) => warning.blocking)
        .map((warning) => warning.code) ?? []
    return (
      blockingCodes.length > 0 &&
      blockingCodes.every((code) =>
        input.initialProposal?.acknowledgedWarningCodes.includes(code)
      )
    )
  })
  const [busy, setBusy] = useState<"generate" | "accept" | "start" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const configurationReady = input.currentConfig != null
  const blockingWarnings =
    proposal?.warnings.filter((warning) => warning.blocking) ?? []
  const currentInputKey = useMemo(
    () =>
      schedulingInputKey({
        folders,
        shiftStartsAt,
        shiftEndsAt,
        orders: input.orders,
        priorityIds,
        selectedOrderIds,
      }),
    [
      folders,
      input.orders,
      priorityIds,
      selectedOrderIds,
      shiftEndsAt,
      shiftStartsAt,
    ]
  )
  const planDirty = proposal !== null && computedInputKey !== currentInputKey

  useEffect(() => {
    const incomingIds = new Set(input.orders.map((order) => order.id))
    setPriorityIds((current) => {
      const next = new Set(
        [...current].filter((orderId) => incomingIds.has(orderId))
      )
      for (const order of input.orders) {
        if (pendingPriorityIds.has(order.id)) continue
        const knownVersion = knownOrderVersions.current.get(order.id)
        if (knownVersion === undefined || knownVersion !== order.version) {
          if (order.priority) next.add(order.id)
          else next.delete(order.id)
          knownOrderVersions.current.set(order.id, order.version)
        }
      }
      for (const orderId of knownOrderVersions.current.keys())
        if (!incomingIds.has(orderId))
          knownOrderVersions.current.delete(orderId)
      return next
    })
  }, [input.orders, pendingPriorityIds])

  const computeForSettings = async (settings: {
    folders: number
    shiftStartsAt: string
    shiftEndsAt: string
  }): Promise<boolean> => {
    setBusy("generate")
    setError(null)
    setSettingsError(null)
    let persistedShift: ProductionShift | null = null
    try {
      if (input.currentConfig == null) {
        const message = t("scheduling.publishBeforeComputing")
        setError(message)
        setSettingsError(message)
        return false
      }
      if (selectedOrderIds.size === 0) {
        const message = t("scheduling.selectBeforeComputing")
        setError(message)
        return false
      }
      if (settings.folders <= 0) {
        const message = t("scheduling.positiveFolders")
        setError(message)
        setSettingsError(message)
        return false
      }
      const startsAt = zonedDateTimeInputToIso(
        settings.shiftStartsAt,
        input.defaults.timezone
      )
      const endsAt = zonedDateTimeInputToIso(
        settings.shiftEndsAt,
        input.defaults.timezone
      )
      if (Date.parse(endsAt) <= Date.parse(startsAt)) {
        const message = t("scheduling.endAfterStart")
        setError(message)
        setSettingsError(message)
        return false
      }

      if (input.currentShift == null) {
        persistedShift = await input.production.createShift({
          locationId: input.locationId,
          startsAt,
          endsAt,
          timezone: input.defaults.timezone,
          effectiveFolderCount: settings.folders,
          idempotencyKey: await input.idempotency.key({
            operation: "create-production-shift",
            payload: {
              locationId: input.locationId,
              startsAt,
              endsAt,
              timezone: input.defaults.timezone,
              effectiveFolderCount: settings.folders,
            },
          }),
        })
      } else if (
        input.currentShift.startsAt === startsAt &&
        input.currentShift.endsAt === endsAt &&
        input.currentShift.effectiveFolderCount === settings.folders
      ) {
        persistedShift = input.currentShift
      } else {
        const update = await input.production.updateShift({
          locationId: input.locationId,
          productionShiftId: input.currentShift.id,
          startsAt,
          endsAt,
          effectiveFolderCount: settings.folders,
          expectedVersion: input.currentShift.version,
          idempotencyKey: await input.idempotency.key({
            operation: "update-production-shift",
            payload: {
              locationId: input.locationId,
              productionShiftId: input.currentShift.id,
              startsAt,
              endsAt,
              effectiveFolderCount: settings.folders,
              expectedVersion: input.currentShift.version,
            },
          }),
        })
        persistedShift = update.productionShift
      }

      setFolders(settings.folders)
      setShiftStartsAt(settings.shiftStartsAt)
      setShiftEndsAt(settings.shiftEndsAt)

      const targetInputKey = schedulingInputKey({
        folders: settings.folders,
        shiftStartsAt: settings.shiftStartsAt,
        shiftEndsAt: settings.shiftEndsAt,
        orders: input.orders,
        priorityIds,
        selectedOrderIds,
      })
      const selection = await input.production.replaceShiftSelection({
        locationId: input.locationId,
        productionShiftId: persistedShift.id,
        selectedOrderIds: [...selectedOrderIds].sort(),
        expectedVersion:
          input.currentShift?.id === persistedShift.id ? selectionVersion : 0,
        idempotencyKey: await input.idempotency.key({
          operation: "replace-shift-order-selection",
          payload: {
            locationId: input.locationId,
            productionShiftId: persistedShift.id,
            selectedOrderIds: [...selectedOrderIds].sort(),
            expectedVersion:
              input.currentShift?.id === persistedShift.id
                ? selectionVersion
                : 0,
          },
        }),
      })
      setSelectionVersion(selection.selection.version)
      const nextProposal = await input.production.createSchedule({
        locationId: input.locationId,
        productionShiftId: persistedShift.id,
        schedulerConfigId: input.currentConfig.id,
        idempotencyKey: await input.idempotency.key({
          operation: "compute-production-schedule",
          payload: {
            locationId: input.locationId,
            productionShiftId: persistedShift.id,
            schedulerConfigId: input.currentConfig.id,
            selectionVersion: selection.selection.version,
            selectedOrderIds: selection.selection.selectedOrderIds,
            supersedesScheduleRunId: proposal?.scheduleRunId ?? null,
          },
        }),
      })
      setProposal(nextProposal)
      setComputedInputKey(targetInputKey)
      setAcknowledged(false)
      await input.onScheduleChanged(persistedShift.id)
      return true
    } catch (cause) {
      const message = presentSchedulingError(cause, "compute", t)
      setError(message)
      setSettingsError(message)
      if (persistedShift !== null) {
        setFolders(settings.folders)
        setShiftStartsAt(settings.shiftStartsAt)
        setShiftEndsAt(settings.shiftEndsAt)
        await input.onScheduleChanged(persistedShift.id).catch(() => undefined)
      }
      return false
    } finally {
      setBusy(null)
    }
  }

  const generate = () =>
    computeForSettings({ folders, shiftStartsAt, shiftEndsAt })

  const saveSettings = (settings: {
    folders: number
    shiftStartsAt: string
    shiftEndsAt: string
  }) => computeForSettings(settings)

  const replaceSelectedOrders = async (next: Set<string>) => {
    if (selectionBusy || !input.canManage) return
    const previous = selectedOrderIds
    setSelectedOrderIds(next)
    setError(null)
    if (input.currentShift == null) return

    setSelectionBusy(true)
    try {
      const orderIds = [...next].sort()
      const replaced = await input.production.replaceShiftSelection({
        locationId: input.locationId,
        productionShiftId: input.currentShift.id,
        selectedOrderIds: orderIds,
        expectedVersion: selectionVersion,
        idempotencyKey: await input.idempotency.key({
          operation: "replace-shift-order-selection",
          payload: {
            locationId: input.locationId,
            productionShiftId: input.currentShift.id,
            selectedOrderIds: orderIds,
            expectedVersion: selectionVersion,
          },
        }),
      })
      setSelectionVersion(replaced.selection.version)
      await input.onScheduleChanged(input.currentShift.id)
    } catch (cause) {
      setSelectedOrderIds(previous)
      setError(presentSchedulingError(cause, "selection", t))
    } finally {
      setSelectionBusy(false)
    }
  }

  const toggleSelection = (orderId: string, selected: boolean) => {
    const next = new Set(selectedOrderIds)
    if (selected) next.add(orderId)
    else next.delete(orderId)
    return replaceSelectedOrders(next)
  }

  const selectAllReady = () =>
    replaceSelectedOrders(new Set(input.orders.map((order) => order.id)))

  const clearSelection = () => replaceSelectedOrders(new Set())

  const togglePriority = async (
    orderId: string,
    version: number,
    priority: boolean
  ) => {
    if (pendingPriorityIds.has(orderId)) return
    const previous = priorityIds
    const next = new Set(previous)
    if (priority) next.add(orderId)
    else next.delete(orderId)
    setPriorityIds(next)
    setPendingPriorityIds((current) => new Set(current).add(orderId))
    setError(null)
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
      if (input.currentShift != null)
        await input.onScheduleChanged(input.currentShift.id)
    } catch (cause) {
      setPriorityIds(previous)
      setError(presentSchedulingError(cause, "priority", t))
    } finally {
      setPendingPriorityIds((current) => {
        const nextPending = new Set(current)
        nextPending.delete(orderId)
        return nextPending
      })
    }
  }

  const accept = async () => {
    if (proposal === null || planDirty) return
    setBusy("accept")
    setError(null)
    try {
      const acknowledgedWarningCodes = acknowledged
        ? blockingWarnings.map((warning) => warning.code).sort()
        : []
      const result = await input.production.acceptSchedule({
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
      await input.onScheduleChanged(result.productionShiftId)
    } catch (cause) {
      setError(presentSchedulingError(cause, "accept", t))
    } finally {
      setBusy(null)
    }
  }

  const start = async () => {
    if (proposal === null || proposal.status !== "accepted" || planDirty) return
    setBusy("start")
    setError(null)
    try {
      const result = await input.production.startSchedule({
        locationId: input.locationId,
        scheduleRunId: proposal.scheduleRunId,
        expectedOutputPlanHash: proposal.outputPlanHash,
        idempotencyKey: await input.idempotency.key({
          operation: "start-production-schedule",
          payload: {
            locationId: input.locationId,
            scheduleRunId: proposal.scheduleRunId,
            expectedOutputPlanHash: proposal.outputPlanHash,
          },
        }),
      })
      await input.onStarted(result, proposal.productionShiftId)
    } catch (cause) {
      setError(presentSchedulingError(cause, "start", t))
      await input.onScheduleChanged(proposal.productionShiftId)
    } finally {
      setBusy(null)
    }
  }

  return {
    proposal,
    orders: input.orders,
    pulseMinutes:
      input.currentConfig?.pulseMinutes ?? input.defaults.pulseMinutes,
    foldRate:
      input.currentConfig?.foldLbsPerFolderMinute ??
      input.defaults.foldLbsPerFolderMinute,
    configVersion: input.currentConfig?.version ?? null,
    folders,
    setFolders,
    shiftStartsAt,
    setShiftStartsAt,
    shiftEndsAt,
    setShiftEndsAt,
    priorityIds,
    selectedOrderIds,
    selectedOrders: input.orders.filter((order) =>
      selectedOrderIds.has(order.id)
    ),
    selectedOrderCount: input.orders.filter((order) =>
      selectedOrderIds.has(order.id)
    ).length,
    selectedWeightLbs: input.orders
      .filter((order) => selectedOrderIds.has(order.id))
      .reduce((total, order) => total + order.derivedWeightLbs, 0),
    staleSelectedOrderCount: [...selectedOrderIds].filter(
      (orderId) => !input.orders.some((order) => order.id === orderId)
    ).length,
    selectionVersion,
    selectionBusy,
    pendingPriorityIds,
    acknowledged,
    setAcknowledged,
    busy,
    error,
    settingsError,
    accepted: proposal?.status === "accepted",
    configurationReady,
    planDirty,
    blockingWarnings,
    generate,
    saveSettings,
    togglePriority,
    toggleSelection,
    selectAllReady,
    clearSelection,
    accept,
    start,
  }
}

export type SchedulingModel = ReturnType<typeof useSchedulingModel>
