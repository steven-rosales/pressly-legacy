import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  AdvanceProductionStageResult,
  ProductionBatch,
  ProductionBatchProgressReconciliationConfirmationRequiredResult,
  ProductionBoard,
  ProductionMachine,
  ProductionOrderPlacementResult,
  ProductionPendingOrder,
  ProductionStageCompletionConfirmationRequiredResult,
  ProductionStageStartConfirmationRequiredResult,
  StageRun,
} from "@pressly/contracts"
import type { IdempotencyPort } from "@/ports/idempotency.port"
import type { ProductionPort } from "@/ports/production.port"
import { RequestFailure } from "@/ports/request.error"
import type { FloorProgressDraft } from "./floor-progress.presenter"

export type ProductionBoardModelInput = Readonly<{
  production: ProductionPort
  idempotency: IdempotencyPort
  locationId: string
  productionRunId: string
  timezone: string
  machines: readonly ProductionMachine[]
  initialBoard?: ProductionBoard
  refreshBoard?: () => Promise<ProductionBoard | null>
  online?: boolean
  updatesState?: "inactive" | "connecting" | "open" | "reconnecting"
  canManage?: boolean
}>

const stageNames = {
  sorting: "Sorting",
  washing: "Washing",
  drying: "Drying",
  folding_packaging: "Folding & packaging",
} as const

const boardError = (cause: unknown) =>
  cause instanceof RequestFailure
    ? cause.message
    : "The production board is unavailable."

const conflictMessage = (cause: unknown, fallback: string) =>
  cause instanceof RequestFailure && cause.kind === "conflict"
    ? "The production queue changed while you were working. It has been refreshed."
    : cause instanceof RequestFailure
      ? cause.message
      : fallback

export function useProductionBoardModel(input: ProductionBoardModelInput) {
  const {
    locationId,
    production,
    productionRunId,
    refreshBoard: refreshBoardFromWorkspace,
  } = input
  const [board, setBoard] = useState<ProductionBoard | null>(
    input.initialBoard ?? null
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const [earlyCompletion, setEarlyCompletion] = useState<{
    stage: StageRun
    result: ProductionStageCompletionConfirmationRequiredResult
  } | null>(null)
  const [earlyStart, setEarlyStart] = useState<{
    stage: StageRun
    result: ProductionStageStartConfirmationRequiredResult
  } | null>(null)
  const [floorProgressOpen, setFloorProgressOpen] = useState(false)
  const [floorProgressError, setFloorProgressError] = useState<string | null>(
    null
  )
  const [floorProgressConfirmation, setFloorProgressConfirmation] = useState<{
    draft: FloorProgressDraft
    result: ProductionBatchProgressReconciliationConfirmationRequiredResult
  } | null>(null)
  const [machineSelections, setMachineSelections] = useState<
    Record<string, readonly string[]>
  >({})
  const [exactBatchSelections, setExactBatchSelections] = useState<
    Record<string, string>
  >({})
  const previousInitialBoard = useRef(input.initialBoard)
  const acceptBoard = useCallback((next: ProductionBoard) => {
    setBoard(next)
    setEarlyCompletion((current) => {
      if (current === null) return null
      const currentStage = next.batches
        .flatMap((batch) => batch.stages)
        .find((stage) => stage.id === current.stage.id)
      return currentStage !== undefined &&
        currentStage.status === "started" &&
        currentStage.version === current.result.stageVersion
        ? current
        : null
    })
    setEarlyStart((current) => {
      if (current === null) return null
      const currentStage = next.batches
        .flatMap((batch) => batch.stages)
        .find((stage) => stage.id === current.stage.id)
      return currentStage !== undefined &&
        currentStage.status === "planned" &&
        currentStage.version === current.result.stageVersion
        ? current
        : null
    })
    setFloorProgressConfirmation((current) => {
      if (current === null) return null
      const currentBatch = next.batches.find(
        (batch) => batch.id === current.draft.productionBatchId
      )
      return currentBatch !== undefined &&
        next.productionRun.queueVersion === current.result.queueVersion &&
        currentBatch.version === current.result.batchVersion &&
        currentBatch.stages.every((stage) =>
          current.result.stageVersions.some(
            (expected) =>
              expected.stageRunId === stage.id &&
              expected.version === stage.version
          )
        )
        ? current
        : null
    })
  }, [])

  useEffect(() => {
    if (input.initialBoard === previousInitialBoard.current) return
    previousInitialBoard.current = input.initialBoard
    if (input.initialBoard === undefined) return
    const nextBoard = input.initialBoard
    const timeout = window.setTimeout(() => acceptBoard(nextBoard), 0)
    return () => window.clearTimeout(timeout)
  }, [acceptBoard, input.initialBoard])

  const refresh = useCallback(async () => {
    try {
      const next =
        refreshBoardFromWorkspace === undefined
          ? await production.loadBoard(locationId, productionRunId)
          : await refreshBoardFromWorkspace()
      if (next !== null) acceptBoard(next)
      setError(null)
      return next
    } catch (cause) {
      setError(boardError(cause))
      return null
    }
  }, [
    acceptBoard,
    locationId,
    production,
    productionRunId,
    refreshBoardFromWorkspace,
  ])

  const totalLbs = useMemo(
    () =>
      board?.batches.reduce((sum, batch) => sum + batch.derivedWeightLbs, 0) ??
      0,
    [board]
  )
  const completedStages = useMemo(
    () =>
      board?.batches
        .flatMap((batch) => batch.stages)
        .filter((stage) => stage.status === "completed").length ?? 0,
    [board]
  )

  const act = async (stage: StageRun, transition: "start" | "complete") => {
    setBusyId(stage.id)
    setError(null)
    try {
      const result = await input.production.advanceStage({
        locationId: input.locationId,
        stageRunId: stage.id,
        transition,
        expectedVersion: stage.version,
        idempotencyKey: await input.idempotency.key({
          operation: `${transition}-production-stage`,
          payload: {
            locationId: input.locationId,
            stageRunId: stage.id,
            transition,
            expectedVersion: stage.version,
          },
        }),
      })
      if (isStartConfirmation(result)) {
        setEarlyStart({ stage, result })
        setAnnouncement(
          `${stageNames[stage.stage]} can start now after confirmation.`
        )
        return
      }
      if (isCompletionConfirmation(result)) {
        setEarlyCompletion({ stage, result })
        setAnnouncement(
          `${stageNames[stage.stage]} can be completed early after confirmation.`
        )
        return
      }
      await refresh()
      setAnnouncement(
        `${stageNames[stage.stage]} ${transition === "start" ? "started" : "completed"}.`
      )
    } catch (cause) {
      await refresh()
      setError(conflictMessage(cause, "The stage action failed."))
    } finally {
      setBusyId(null)
    }
  }

  const confirmEarlyStart = async () => {
    if (earlyStart === null) return
    const { stage, result: prompt } = earlyStart
    setBusyId(stage.id)
    setError(null)
    try {
      const result = await input.production.advanceStage({
        locationId: input.locationId,
        stageRunId: stage.id,
        transition: "start",
        expectedVersion: prompt.stageVersion,
        confirmation: prompt.confirmation,
        idempotencyKey: await input.idempotency.key({
          operation: "confirm-early-production-stage-start",
          payload: {
            locationId: input.locationId,
            stageRunId: stage.id,
            expectedVersion: prompt.stageVersion,
            confirmation: prompt.confirmation,
          },
        }),
      })
      if (isStartConfirmation(result)) {
        setEarlyStart({ stage, result })
        return
      }
      setEarlyStart(null)
      await refresh()
      setAnnouncement(`${stageNames[stage.stage]} started.`)
    } catch (cause) {
      setEarlyStart(null)
      await refresh()
      setError(
        conflictMessage(
          cause,
          "The early start could not be confirmed. Review the current stage and try again."
        )
      )
    } finally {
      setBusyId(null)
    }
  }

  const confirmEarlyCompletion = async () => {
    if (earlyCompletion === null) return
    const { stage, result: prompt } = earlyCompletion
    setBusyId(stage.id)
    setError(null)
    try {
      const result = await input.production.advanceStage({
        locationId: input.locationId,
        stageRunId: stage.id,
        transition: "complete",
        expectedVersion: prompt.stageVersion,
        confirmation: prompt.confirmation,
        idempotencyKey: await input.idempotency.key({
          operation: "confirm-early-production-stage-completion",
          payload: {
            locationId: input.locationId,
            stageRunId: stage.id,
            expectedVersion: prompt.stageVersion,
            confirmation: prompt.confirmation,
          },
        }),
      })
      if (isCompletionConfirmation(result)) {
        setEarlyCompletion({ stage, result })
        return
      }
      setEarlyCompletion(null)
      await refresh()
      setAnnouncement(`${stageNames[stage.stage]} completed.`)
    } catch (cause) {
      setEarlyCompletion(null)
      await refresh()
      setError(
        conflictMessage(
          cause,
          "Early completion could not be confirmed. Review the current stage and try again."
        )
      )
    } finally {
      setBusyId(null)
    }
  }

  const selectedMachineIds = (stage: StageRun): readonly string[] =>
    machineSelections[stage.id] ?? stage.machineIds

  const toggleMachine = (
    stage: StageRun,
    machineId: string,
    checked: boolean
  ) =>
    setMachineSelections((current) => {
      const selected = new Set(current[stage.id] ?? stage.machineIds)
      if (checked) selected.add(machineId)
      else selected.delete(machineId)
      return { ...current, [stage.id]: [...selected] }
    })

  const assignMachines = async (stage: StageRun) => {
    const machineIds = [...selectedMachineIds(stage)].sort()
    if (machineIds.length === 0) {
      setError("Select at least one active machine for this stage.")
      return false
    }

    setBusyId(stage.id)
    setError(null)
    try {
      await input.production.assignStageMachines({
        locationId: input.locationId,
        stageRunId: stage.id,
        machineIds,
        expectedVersion: stage.version,
        idempotencyKey: await input.idempotency.key({
          operation: "assign-stage-machines",
          payload: {
            locationId: input.locationId,
            stageRunId: stage.id,
            machineIds,
            expectedVersion: stage.version,
          },
        }),
      })
      await refresh()
      setAnnouncement(`${stageNames[stage.stage]} machines assigned.`)
      return true
    } catch (cause) {
      await refresh()
      setError(conflictMessage(cause, "Machines could not be assigned."))
      return false
    } finally {
      setBusyId(null)
    }
  }

  const mutateMembership = async (
    batch: ProductionBatch,
    action: "freeze" | "unfreeze"
  ) => {
    if (board === null) return
    setBusyId(batch.id)
    setError(null)
    try {
      const command = {
        locationId: input.locationId,
        productionRunId: board.productionRun.id,
        productionBatchId: batch.id,
        expectedQueueVersion: board.productionRun.queueVersion,
        expectedBatchVersion: batch.version,
        idempotencyKey: await input.idempotency.key({
          operation: `${action}-production-batch`,
          payload: {
            productionRunId: board.productionRun.id,
            productionBatchId: batch.id,
            expectedQueueVersion: board.productionRun.queueVersion,
            expectedBatchVersion: batch.version,
          },
        }),
      }
      if (action === "freeze") await input.production.freezeBatch(command)
      else await input.production.unfreezeBatch(command)
      await refresh()
      setAnnouncement(
        `Batch ${batch.sequence + 1} ${action === "freeze" ? "frozen" : "unfrozen"}.`
      )
    } catch (cause) {
      await refresh()
      setError(
        conflictMessage(
          cause,
          `The batch could not be ${action === "freeze" ? "frozen" : "unfrozen"}.`
        )
      )
    } finally {
      setBusyId(null)
    }
  }

  const finishPlacement = async (
    order: ProductionPendingOrder,
    result: ProductionOrderPlacementResult
  ) => {
    await refresh()
    if (result.status === "confirmation_required") {
      setAnnouncement(
        `Order ${order.externalOrderId} needs an overtime confirmation.`
      )
      return
    }

    if (result.status === "not_placed") setError(result.message)
    else {
      setExactBatchSelections((current) => {
        const next = { ...current }
        delete next[order.id]
        return next
      })
      setAnnouncement(`Order ${order.externalOrderId} was placed.`)
    }
  }

  const retryAutomaticPlacement = async (order: ProductionPendingOrder) => {
    if (board === null) return
    setBusyId(order.id)
    setError(null)
    try {
      const result = await input.production.retryAutomaticPlacement({
        locationId: input.locationId,
        productionRunId: board.productionRun.id,
        productionOrderId: order.id,
        expectedQueueVersion: board.productionRun.queueVersion,
        idempotencyKey: await input.idempotency.key({
          operation: "retry-automatic-placement",
          payload: {
            productionRunId: board.productionRun.id,
            productionOrderId: order.id,
            expectedQueueVersion: board.productionRun.queueVersion,
          },
        }),
      })
      await finishPlacement(order, result)
    } catch (cause) {
      await refresh()
      setError(conflictMessage(cause, "Automatic placement could not run."))
    } finally {
      setBusyId(null)
    }
  }

  const selectExactBatch = (orderId: string, batchId: string) =>
    setExactBatchSelections((current) => ({
      ...current,
      [orderId]: batchId,
    }))

  const placeOrderExactly = async (order: ProductionPendingOrder) => {
    if (board === null) return
    const productionBatchId = exactBatchSelections[order.id]
    const batch = board.batches.find(
      (candidate) => candidate.id === productionBatchId
    )
    if (batch === undefined) {
      setError("Choose a mutable queued batch for exact placement.")
      return
    }
    setBusyId(order.id)
    setError(null)
    try {
      const result = await input.production.placeOrderExactly({
        locationId: input.locationId,
        productionRunId: board.productionRun.id,
        productionOrderId: order.id,
        productionBatchId: batch.id,
        expectedQueueVersion: board.productionRun.queueVersion,
        expectedBatchVersion: batch.version,
        idempotencyKey: await input.idempotency.key({
          operation: "place-production-order-exactly",
          payload: {
            productionRunId: board.productionRun.id,
            productionOrderId: order.id,
            productionBatchId: batch.id,
            expectedQueueVersion: board.productionRun.queueVersion,
            expectedBatchVersion: batch.version,
          },
        }),
      })
      await finishPlacement(order, result)
    } catch (cause) {
      await refresh()
      setError(conflictMessage(cause, "Exact placement could not be saved."))
    } finally {
      setBusyId(null)
    }
  }

  const confirmOvertime = async (order: ProductionPendingOrder) => {
    if (board === null) return
    const confirmation = order.placement
    if (confirmation.status !== "confirmation_required") return
    setBusyId(order.id)
    setError(null)
    try {
      const result = await input.production.confirmPlacementOvertime({
        locationId: input.locationId,
        productionRunId: board.productionRun.id,
        productionOrderId: order.id,
        expectedQueueVersion: confirmation.queueVersion,
        proposalHash: confirmation.proposalHash,
        idempotencyKey: await input.idempotency.key({
          operation: "confirm-placement-overtime",
          payload: {
            productionRunId: board.productionRun.id,
            productionOrderId: order.id,
            expectedQueueVersion: confirmation.queueVersion,
            proposalHash: confirmation.proposalHash,
          },
        }),
      })
      await finishPlacement(order, result)
    } catch (cause) {
      await refresh()
      setError(conflictMessage(cause, "Overtime confirmation is stale."))
    } finally {
      setBusyId(null)
    }
  }

  const finishFloorProgress = async (
    batchSequence: number,
    result: Extract<
      Awaited<ReturnType<ProductionPort["reconcileBatchProgress"]>>,
      { status: "reconciled" }
    >
  ) => {
    setFloorProgressConfirmation(null)
    setFloorProgressOpen(false)
    await refresh()
    setAnnouncement(
      "Batch " +
        (batchSequence + 1) +
        " floor progress recorded" +
        (result.shiftClosed ? "; the shift is closed." : ".")
    )
  }

  const reconcileFloorProgress = async (draft: FloorProgressDraft) => {
    if (board === null) return
    const batch = board.batches.find(
      (candidate) => candidate.id === draft.productionBatchId
    )
    if (batch === undefined) {
      setFloorProgressError("The selected batch is no longer on this board.")
      return
    }

    const expectedStageVersions = batch.stages.map((stage) => ({
      stageRunId: stage.id,
      version: stage.version,
    }))
    const command = {
      locationId: input.locationId,
      productionRunId: board.productionRun.id,
      productionBatchId: batch.id,
      expectedQueueVersion: board.productionRun.queueVersion,
      expectedBatchVersion: batch.version,
      expectedStageVersions,
      target: draft.target,
      reason: draft.reason,
      ...(draft.note === null ? {} : { note: draft.note }),
      machineIds: [...draft.machineIds],
    }

    setBusyId(batch.id)
    setFloorProgressError(null)
    setFloorProgressConfirmation(null)
    try {
      const result = await input.production.reconcileBatchProgress({
        ...command,
        idempotencyKey: await input.idempotency.key({
          operation: "review-production-batch-progress-reconciliation",
          payload: command,
        }),
      })
      if (result.status === "confirmation_required") {
        setFloorProgressConfirmation({ draft, result })
        setAnnouncement(
          "Batch " + (batch.sequence + 1) + " progress is ready to confirm."
        )
        return
      }
      await finishFloorProgress(batch.sequence, result)
    } catch (cause) {
      await refresh()
      setFloorProgressError(
        conflictMessage(
          cause,
          "Floor progress could not be reviewed. Check the batch and try again."
        )
      )
    } finally {
      setBusyId(null)
    }
  }

  const confirmFloorProgress = async () => {
    if (board === null || floorProgressConfirmation === null) return
    const { draft, result: prompt } = floorProgressConfirmation
    const batch = board.batches.find(
      (candidate) => candidate.id === draft.productionBatchId
    )
    if (batch === undefined) {
      setFloorProgressConfirmation(null)
      setFloorProgressError("The selected batch is no longer on this board.")
      return
    }
    const command = {
      locationId: input.locationId,
      productionRunId: prompt.productionRunId,
      productionBatchId: prompt.productionBatchId,
      expectedQueueVersion: prompt.queueVersion,
      expectedBatchVersion: prompt.batchVersion,
      expectedStageVersions: prompt.stageVersions,
      target: draft.target,
      reason: draft.reason,
      ...(draft.note === null ? {} : { note: draft.note }),
      machineIds: [...draft.machineIds],
      confirmation: prompt.confirmation,
    }

    setBusyId(batch.id)
    setFloorProgressError(null)
    try {
      const result = await input.production.reconcileBatchProgress({
        ...command,
        idempotencyKey: await input.idempotency.key({
          operation: "confirm-production-batch-progress-reconciliation",
          payload: command,
        }),
      })
      if (result.status === "confirmation_required") {
        setFloorProgressConfirmation({ draft, result })
        return
      }
      await finishFloorProgress(batch.sequence, result)
    } catch (cause) {
      setFloorProgressConfirmation(null)
      await refresh()
      setFloorProgressError(
        conflictMessage(
          cause,
          "The floor record changed. Review the current state and record again."
        )
      )
    } finally {
      setBusyId(null)
    }
  }

  return {
    board,
    busyId,
    error,
    announcement,
    earlyCompletion,
    earlyStart,
    floorProgressOpen,
    floorProgressError,
    floorProgressConfirmation:
      floorProgressConfirmation === null
        ? null
        : floorProgressConfirmation.result,
    totalLbs,
    completedStages,
    exactBatchSelections,
    refresh,
    act,
    confirmEarlyStart,
    dismissEarlyStart: () => setEarlyStart(null),
    confirmEarlyCompletion,
    dismissEarlyCompletion: () => setEarlyCompletion(null),
    selectedMachineIds,
    toggleMachine,
    assignMachines,
    mutateMembership,
    retryAutomaticPlacement,
    selectExactBatch,
    placeOrderExactly,
    confirmOvertime,
    openFloorProgress: () => {
      setFloorProgressError(null)
      setFloorProgressConfirmation(null)
      setFloorProgressOpen(true)
    },
    closeFloorProgress: () => {
      if (busyId !== null) return
      setFloorProgressOpen(false)
      setFloorProgressError(null)
      setFloorProgressConfirmation(null)
    },
    reconcileFloorProgress,
    confirmFloorProgress,
    invalidateFloorProgressConfirmation: () =>
      setFloorProgressConfirmation(null),
  }
}

const isCompletionConfirmation = (
  result: AdvanceProductionStageResult
): result is ProductionStageCompletionConfirmationRequiredResult =>
  "status" in result &&
  result.status === "confirmation_required" &&
  result.code === "PULSE_BOUNDARY_NOT_REACHED"

const isStartConfirmation = (
  result: AdvanceProductionStageResult
): result is ProductionStageStartConfirmationRequiredResult =>
  "status" in result &&
  result.status === "confirmation_required" &&
  result.code === "PLANNED_START_NOT_REACHED"

export type ProductionBoardModel = ReturnType<typeof useProductionBoardModel>
