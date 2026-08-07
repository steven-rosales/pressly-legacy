import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type {
  ProcessorProductionLiveRunChangeOrder,
  ProcessorProductionLiveRunChanges,
} from "@pressly/contracts/processor"
import type {
  ProductionLiveExactBatchTarget,
  ProductionOrderPlacementResult,
} from "@pressly/contracts/production"
import type { IdempotencyPort } from "@/ports/idempotency.port"
import type { ProductionPort } from "@/ports/production.port"
import {
  presentLivePlacementFailure,
  presentLiveRunActionError,
  type LivePlacementProjection,
} from "./live-run-changes.presenter"

export type LiveRunChangesModelInput = Readonly<{
  production: ProductionPort
  idempotency: IdempotencyPort
  locationId: string
  changes: ProcessorProductionLiveRunChanges | null
  onMutated: () => Promise<void>
}>

const confirmationProjection = (
  order: ProcessorProductionLiveRunChangeOrder
): LivePlacementProjection | null => {
  if (
    order.recommendedPlacement.status === "available" &&
    order.recommendedPlacement.placement.allowedActions[0] ===
      "confirm_overtime"
  )
    return order.recommendedPlacement.placement
  return (
    order.exactBatchTargets.find(
      (target) => target.allowedActions[0] === "confirm_overtime"
    ) ?? null
  )
}

export function useLiveRunChangesModel(input: LiveRunChangesModelInput) {
  const { t } = useTranslation()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null)
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)

  const detailOrder =
    input.changes?.orders.find((order) => order.id === detailOrderId) ?? null
  const selectedTarget =
    detailOrder?.exactBatchTargets.find(
      (target) => target.target.productionBatchId === selectedTargetId
    ) ?? null

  const confirmations = useMemo(
    () =>
      new Map(
        (input.changes?.orders ?? []).flatMap((order) => {
          const projection = confirmationProjection(order)
          return projection === null ? [] : [[order.id, projection] as const]
        })
      ),
    [input.changes]
  )

  const finishPlacement = async (
    order: ProcessorProductionLiveRunChangeOrder,
    result: ProductionOrderPlacementResult
  ) => {
    await input.onMutated()
    if (result.status === "confirmation_required") {
      setAnnouncement(
        t("liveRunChanges.announcement.overtimeReady", {
          orderId: order.externalOrderId,
        })
      )
      return
    }
    if (result.status === "not_placed") {
      setError(presentLivePlacementFailure(result.reason, t))
      return
    }
    setDetailOrderId(null)
    setSelectedTargetId(null)
    setAnnouncement(
      t("liveRunChanges.announcement.added", {
        orderId: order.externalOrderId,
      })
    )
  }

  const addAtBestFit = async (order: ProcessorProductionLiveRunChangeOrder) => {
    if (
      input.changes === null ||
      order.recommendedPlacement.status !== "available"
    )
      return
    const placement = order.recommendedPlacement.placement
    if (placement.allowedActions[0] !== "place_automatically") return
    setBusyId(order.id)
    setError(null)
    try {
      const result = await input.production.retryAutomaticPlacement({
        locationId: input.locationId,
        productionRunId: input.changes.productionRunId,
        productionOrderId: order.id,
        expectedQueueVersion: placement.expectedQueueVersion,
        idempotencyKey: await input.idempotency.key({
          operation: "retry-automatic-placement",
          payload: {
            productionRunId: input.changes.productionRunId,
            productionOrderId: order.id,
            expectedQueueVersion: placement.expectedQueueVersion,
            expectedOrderVersion: placement.expectedOrderVersion,
            proposalHash: placement.proposalHash,
          },
        }),
      })
      await finishPlacement(order, result)
    } catch (cause) {
      await input.onMutated()
      setError(presentLiveRunActionError(cause, t))
    } finally {
      setBusyId(null)
    }
  }

  const addToSelectedBatch = async () => {
    if (
      input.changes === null ||
      detailOrder === null ||
      selectedTarget === null ||
      selectedTarget.allowedActions[0] !== "place_exactly"
    )
      return
    const order = detailOrder
    const target: ProductionLiveExactBatchTarget = selectedTarget
    setBusyId(order.id)
    setError(null)
    try {
      const result = await input.production.placeOrderExactly({
        locationId: input.locationId,
        productionRunId: input.changes.productionRunId,
        productionOrderId: order.id,
        productionBatchId: target.target.productionBatchId,
        expectedQueueVersion: target.expectedQueueVersion,
        expectedBatchVersion: target.expectedBatchVersion,
        idempotencyKey: await input.idempotency.key({
          operation: "place-production-order-exactly",
          payload: {
            productionRunId: input.changes.productionRunId,
            productionOrderId: order.id,
            productionBatchId: target.target.productionBatchId,
            expectedQueueVersion: target.expectedQueueVersion,
            expectedBatchVersion: target.expectedBatchVersion,
            expectedOrderVersion: target.expectedOrderVersion,
            proposalHash: target.proposalHash,
          },
        }),
      })
      await finishPlacement(order, result)
    } catch (cause) {
      await input.onMutated()
      setError(presentLiveRunActionError(cause, t))
    } finally {
      setBusyId(null)
    }
  }

  const confirmOvertime = async (
    order: ProcessorProductionLiveRunChangeOrder
  ) => {
    if (input.changes === null) return
    const projection = confirmations.get(order.id)
    const confirmation = order.placement
    if (
      projection === undefined ||
      confirmation.status !== "confirmation_required"
    )
      return
    setBusyId(order.id)
    setError(null)
    try {
      const result = await input.production.confirmPlacementOvertime({
        locationId: input.locationId,
        productionRunId: input.changes.productionRunId,
        productionOrderId: order.id,
        expectedQueueVersion: confirmation.queueVersion,
        proposalHash: confirmation.proposalHash,
        idempotencyKey: await input.idempotency.key({
          operation: "confirm-placement-overtime",
          payload: {
            productionRunId: input.changes.productionRunId,
            productionOrderId: order.id,
            expectedQueueVersion: confirmation.queueVersion,
            proposalHash: confirmation.proposalHash,
          },
        }),
      })
      await finishPlacement(order, result)
    } catch (cause) {
      await input.onMutated()
      setError(presentLiveRunActionError(cause, t))
    } finally {
      setBusyId(null)
    }
  }

  const openBatchChoice = (order: ProcessorProductionLiveRunChangeOrder) => {
    setDetailOrderId(order.id)
    setSelectedTargetId(null)
  }

  const refresh = async () => {
    setBusyId("refresh")
    setError(null)
    try {
      await input.onMutated()
    } catch (cause) {
      setError(presentLiveRunActionError(cause, t))
    } finally {
      setBusyId(null)
    }
  }

  return {
    busyId,
    error,
    announcement,
    detailOrder,
    selectedTarget,
    confirmations,
    refresh,
    addAtBestFit,
    addToSelectedBatch,
    confirmOvertime,
    openBatchChoice,
    closeBatchChoice: () => {
      if (busyId !== null) return
      setDetailOrderId(null)
      setSelectedTargetId(null)
    },
    selectTarget: setSelectedTargetId,
  }
}
