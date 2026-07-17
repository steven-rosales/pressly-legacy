import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { ProductionOrderListItem } from "@pressly/contracts"
import type { ProductionPort } from "@/ports/production.port"
import type { IdempotencyPort } from "@/ports/idempotency.port"
import { presentIntakeError } from "./intake.error.presenter"

export type IntakeModelInput = Readonly<{
  production: ProductionPort
  idempotency: IdempotencyPort
  locationId: string
  orders: readonly ProductionOrderListItem[]
  onRecorded: () => Promise<void>
}>

export function useIntakeModel(input: IntakeModelInput) {
  const { t } = useTranslation()
  const [bagCounts, setBagCounts] = useState<Record<string, string>>({})
  const [priorities, setPriorities] = useState<Record<string, boolean>>({})
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setBagCount = (orderId: string, value: string) =>
    setBagCounts((current) => ({ ...current, [orderId]: value }))

  const setPriority = (orderId: string, value: boolean) =>
    setPriorities((current) => ({ ...current, [orderId]: value }))

  const record = async (order: ProductionOrderListItem) => {
    const bagCount = Number(bagCounts[order.id])
    if (!Number.isInteger(bagCount) || bagCount < 0) {
      setError(t("intake.invalidBagCount"))
      return
    }

    setBusyOrderId(order.id)
    setError(null)
    try {
      const priority = priorities[order.id] ?? order.priority
      const orderVersion =
        priority === order.priority
          ? order.version
          : (
              await input.production.setPriority({
                locationId: input.locationId,
                productionOrderId: order.id,
                priority,
                expectedVersion: order.version,
                idempotencyKey: await input.idempotency.key({
                  operation: "set-intake-order-priority",
                  payload: {
                    locationId: input.locationId,
                    productionOrderId: order.id,
                    priority,
                    expectedVersion: order.version,
                  },
                }),
              })
            ).version
      await input.production.recordIntake({
        locationId: input.locationId,
        productionOrderId: order.id,
        bagCount,
        expectedVersion: orderVersion,
        idempotencyKey: await input.idempotency.key({
          operation: "record-order-intake",
          payload: {
            locationId: input.locationId,
            productionOrderId: order.id,
            bagCount,
            expectedVersion: orderVersion,
          },
        }),
      })
      await input.onRecorded()
      setBagCounts((current) => {
        const next = { ...current }
        delete next[order.id]
        return next
      })
      setPriorities((current) => {
        const next = { ...current }
        delete next[order.id]
        return next
      })
    } catch (cause) {
      setError(presentIntakeError(cause, t))
      await input.onRecorded()
    } finally {
      setBusyOrderId(null)
    }
  }

  return {
    bagCounts,
    priorities,
    busyOrderId,
    error,
    setBagCount,
    setPriority,
    record,
  }
}
