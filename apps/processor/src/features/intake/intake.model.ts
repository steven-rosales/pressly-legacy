import { useState } from "react"
import type { ProductionOrderListItem } from "@pressly/contracts"
import type { ProductionPort } from "@/ports/production.port"
import type { IdempotencyPort } from "@/ports/idempotency.port"
import { RequestFailure } from "@/ports/request.error"

export type IntakeModelInput = Readonly<{
  production: ProductionPort
  idempotency: IdempotencyPort
  locationId: string
  orders: readonly ProductionOrderListItem[]
  onRecorded: () => Promise<void>
}>

export function useIntakeModel(input: IntakeModelInput) {
  const [bagCounts, setBagCounts] = useState<Record<string, string>>({})
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setBagCount = (orderId: string, value: string) =>
    setBagCounts((current) => ({ ...current, [orderId]: value }))

  const record = async (order: ProductionOrderListItem) => {
    const bagCount = Number(bagCounts[order.id])
    if (!Number.isInteger(bagCount) || bagCount < 0) {
      setError("Bag count must be a whole number of zero or more.")
      return
    }

    setBusyOrderId(order.id)
    setError(null)
    try {
      await input.production.recordIntake({
        locationId: input.locationId,
        productionOrderId: order.id,
        bagCount,
        expectedVersion: order.version,
        idempotencyKey: await input.idempotency.key({
          operation: "record-order-intake",
          payload: {
            locationId: input.locationId,
            productionOrderId: order.id,
            bagCount,
            expectedVersion: order.version,
          },
        }),
      })
      await input.onRecorded()
      setBagCounts((current) => {
        const next = { ...current }
        delete next[order.id]
        return next
      })
    } catch (cause) {
      setError(
        cause instanceof RequestFailure && cause.kind === "conflict"
          ? "This order changed while intake was open. The workspace has been refreshed."
          : cause instanceof RequestFailure
            ? cause.message
            : "Bag intake could not be recorded."
      )
      await input.onRecorded()
    } finally {
      setBusyOrderId(null)
    }
  }

  return { bagCounts, busyOrderId, error, setBagCount, record }
}
