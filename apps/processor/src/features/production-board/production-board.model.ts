import { useEffect, useMemo, useState } from "react"
import type {
  ProductionBoard,
  ProductionMachine,
  StageRun,
} from "@pressly/contracts"
import type { ProductionPort } from "@/ports/production.port"
import type { IdempotencyPort } from "@/ports/idempotency.port"
import { RequestFailure } from "@/ports/request.error"

export type ProductionBoardModelInput = Readonly<{
  production: ProductionPort
  idempotency: IdempotencyPort
  locationId: string
  productionShiftId: string
  timezone: string
  machines: readonly ProductionMachine[]
  initialBoard?: ProductionBoard
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

export function useProductionBoardModel(input: ProductionBoardModelInput) {
  const [board, setBoard] = useState<ProductionBoard | null>(
    input.initialBoard ?? null
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const [machineSelections, setMachineSelections] = useState<
    Record<string, readonly string[]>
  >({})

  const refresh = async () => {
    try {
      const next = await input.production.loadBoard(
        input.locationId,
        input.productionShiftId
      )
      setBoard(next)
      setError(null)
      return next
    } catch (cause) {
      setError(boardError(cause))
      return null
    }
  }

  useEffect(() => {
    let active = true
    void input.production
      .loadBoard(input.locationId, input.productionShiftId)
      .then((next) => {
        if (active) setBoard(next)
      })
      .catch((cause: unknown) => {
        if (active) setError(boardError(cause))
      })
    return () => {
      active = false
    }
  }, [input.locationId, input.production, input.productionShiftId])

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

  const startRun = async () => {
    if (board?.productionRun === null || board?.productionRun === undefined)
      return
    const run = board.productionRun
    setBusyId(run.id)
    try {
      await input.production.startRun({
        locationId: input.locationId,
        productionRunId: run.id,
        expectedVersion: run.version,
        idempotencyKey: await input.idempotency.key({
          operation: "start-production-run",
          payload: {
            locationId: input.locationId,
            productionRunId: run.id,
            expectedVersion: run.version,
          },
        }),
      })
      await refresh()
      setAnnouncement("Production run started.")
    } catch (cause) {
      await refresh()
      setError(
        cause instanceof RequestFailure
          ? cause.message
          : "The run could not be started."
      )
    } finally {
      setBusyId(null)
    }
  }

  const act = async (stage: StageRun, transition: "start" | "complete") => {
    setBusyId(stage.id)
    setError(null)
    try {
      await input.production.advanceStage({
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
      await refresh()
      setAnnouncement(
        `${stageNames[stage.stage]} ${transition === "start" ? "started" : "completed"}.`
      )
    } catch (cause) {
      await refresh()
      setError(
        cause instanceof RequestFailure && cause.kind === "conflict"
          ? "The board changed while you were working. It has been refreshed."
          : cause instanceof RequestFailure
            ? cause.message
            : "The stage action failed."
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
      return
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
    } catch (cause) {
      await refresh()
      setError(
        cause instanceof RequestFailure && cause.kind === "conflict"
          ? "Machine availability changed. The board has been refreshed."
          : cause instanceof RequestFailure
            ? cause.message
            : "Machines could not be assigned."
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
    totalLbs,
    completedStages,
    refresh,
    startRun,
    act,
    selectedMachineIds,
    toggleMachine,
    assignMachines,
  }
}

export type ProductionBoardModel = ReturnType<typeof useProductionBoardModel>
