import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { ProcessorOrderControlItem } from "@pressly/contracts"
import type { ProductionPort } from "@/ports/production.port"
import type { IdempotencyPort } from "@/ports/idempotency.port"
import { presentIntakeError } from "./intake.error.presenter"

export type IntakeTab = "forecast_only" | "needs_intake" | "ready"

export type IntakeAdmissionDecision = Readonly<{
  item: ProcessorOrderControlItem
  target: "released" | "source"
}>

export type IntakeModelInput = Readonly<{
  production: ProductionPort
  idempotency: IdempotencyPort
  locationId: string
  revision: string
  onMutated: () => Promise<void>
}>

const matchesTab = (
  item: ProcessorOrderControlItem,
  tab: IntakeTab
): boolean => {
  if (tab === "forecast_only") return item.order.status === "release_pending"
  if (tab === "needs_intake") return item.order.status === "intake_pending"
  return item.order.status === "eligible"
}

export function useIntakeModel(input: IntakeModelInput) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<IntakeTab>("forecast_only")
  const [items, setItems] = useState<readonly ProcessorOrderControlItem[]>([])
  const [bagCounts, setBagCounts] = useState<Record<string, string>>({})
  const [priorities, setPriorities] = useState<Record<string, boolean>>({})
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [decision, setDecision] = useState<IntakeAdmissionDecision | null>(null)
  const loadSequence = useRef(0)

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    setLoading(true)
    setError(null)
    try {
      const nextItems: ProcessorOrderControlItem[] = []
      let cursor: string | undefined
      do {
        const page = await input.production.listOrderControl({
          locationId: input.locationId,
          query: {
            view: "intake",
            limit: 100,
            ...(cursor === undefined ? {} : { cursor }),
          },
        })
        nextItems.push(...page.items)
        cursor = page.nextCursor ?? undefined
      } while (cursor !== undefined)
      if (sequence === loadSequence.current) setItems(nextItems)
    } catch (cause) {
      if (sequence === loadSequence.current)
        setError(presentIntakeError(cause, t, "load"))
    } finally {
      if (sequence === loadSequence.current) setLoading(false)
    }
  }, [input.locationId, input.production, t])

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [load, input.revision])

  const refreshAfterMutation = useCallback(async () => {
    await Promise.all([load(), input.onMutated()])
  }, [input, load])

  const setBagCount = (orderId: string, value: string) =>
    setBagCounts((current) => ({ ...current, [orderId]: value }))

  const setPriority = (orderId: string, value: boolean) =>
    setPriorities((current) => ({ ...current, [orderId]: value }))

  const record = async (item: ProcessorOrderControlItem) => {
    const order = item.order
    const bagCount = Number(
      bagCounts[order.id] ?? order.bagCount?.toString() ?? ""
    )
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
      await refreshAfterMutation()
    } catch (cause) {
      setError(presentIntakeError(cause, t))
      await load()
    } finally {
      setBusyOrderId(null)
    }
  }

  const confirmAdmission = async () => {
    if (decision === null) return
    const { item, target } = decision
    setBusyOrderId(item.order.id)
    setError(null)
    try {
      await input.production.changeAdmission({
        locationId: input.locationId,
        productionOrderId: item.order.id,
        target,
        expectedVersion: item.order.version,
        idempotencyKey: await input.idempotency.key({
          operation:
            target === "released"
              ? "release-order-to-production"
              : "return-order-to-source-admission",
          payload: {
            locationId: input.locationId,
            productionOrderId: item.order.id,
            target,
            expectedVersion: item.order.version,
          },
        }),
      })
      setDecision(null)
      await refreshAfterMutation()
    } catch (cause) {
      setDecision(null)
      setError(presentIntakeError(cause, t))
      await load()
    } finally {
      setBusyOrderId(null)
    }
  }

  const counts = useMemo(
    () => ({
      forecastOnly: items.filter((item) => matchesTab(item, "forecast_only"))
        .length,
      needsIntake: items.filter((item) => matchesTab(item, "needs_intake"))
        .length,
      ready: items.filter((item) => matchesTab(item, "ready")).length,
    }),
    [items]
  )

  return {
    tab,
    setTab,
    items: items.filter((item) => matchesTab(item, tab)),
    counts,
    bagCounts,
    priorities,
    busyOrderId,
    loading,
    error,
    decision,
    setDecision,
    setBagCount,
    setPriority,
    record,
    confirmAdmission,
    refresh: load,
  }
}
