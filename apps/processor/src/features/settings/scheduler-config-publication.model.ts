import { useState } from "react"
import type { SchedulerConfig } from "@pressly/contracts"
import type { IdempotencyPort } from "@/ports/idempotency.port"
import type { ProductionPort } from "@/ports/production.port"
import { RequestFailure } from "@/ports/request.error"

const initialPulseMinutes = 56
const initialFoldRate = 2

type StageFitKey = "sortingFits" | "washingFits" | "dryingFits"

const messageFor = (error: unknown) =>
  error instanceof RequestFailure
    ? error.message
    : error instanceof TypeError
      ? error.message
      : "The production configuration could not be published. Try again."

export function useSchedulerConfigPublication({
  production,
  idempotency,
  locationId,
  currentConfig,
  onPublished,
}: Readonly<{
  production: ProductionPort
  idempotency: IdempotencyPort
  locationId: string
  currentConfig: SchedulerConfig | null
  onPublished: (config: SchedulerConfig) => Promise<void>
}>) {
  const [pulseMinutes, setPulseMinutes] = useState(
    currentConfig?.pulseMinutes ?? initialPulseMinutes
  )
  const [foldRate, setFoldRate] = useState(
    currentConfig?.foldLbsPerFolderMinute ?? initialFoldRate
  )
  const [stageFit, setStageFit] = useState({
    sortingFits: false,
    washingFits: false,
    dryingFits: false,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pulseMinutesValid = Number.isFinite(pulseMinutes) && pulseMinutes > 0
  const foldRateValid = Number.isFinite(foldRate) && foldRate > 0
  const stageFitConfirmedCount = Object.values(stageFit).filter(Boolean).length
  const stageFitRemaining = 3 - stageFitConfirmedCount
  const stageFitConfirmed =
    stageFit.sortingFits && stageFit.washingFits && stageFit.dryingFits
  const canPublish =
    !busy && pulseMinutesValid && foldRateValid && stageFitConfirmed

  const reset = () => {
    setPulseMinutes(currentConfig?.pulseMinutes ?? initialPulseMinutes)
    setFoldRate(currentConfig?.foldLbsPerFolderMinute ?? initialFoldRate)
    setStageFit({
      sortingFits: false,
      washingFits: false,
      dryingFits: false,
    })
    setError(null)
  }

  const setStageFitAssertion = (key: StageFitKey, checked: boolean) =>
    setStageFit((current) => ({ ...current, [key]: checked }))

  const publish = async (): Promise<boolean> => {
    setError(null)
    if (!pulseMinutesValid || !foldRateValid) {
      setError("Pulse duration and fold rate must both be positive.")
      return false
    }
    if (!stageFitConfirmed) {
      setError(
        "Confirm sorting, washing, and drying fit inside this exact pulse."
      )
      return false
    }

    setBusy(true)
    try {
      const stageFitAssertion = {
        sortingFits: true,
        washingFits: true,
        dryingFits: true,
      } as const
      const config = await production.publishConfig({
        locationId,
        pulseMinutes,
        foldLbsPerFolderMinute: foldRate,
        stageFitAssertion,
        idempotencyKey: await idempotency.key({
          operation: "publish-scheduler-config",
          payload: {
            locationId,
            supersedesSchedulerConfigId: currentConfig?.id ?? null,
            pulseMinutes,
            foldLbsPerFolderMinute: foldRate,
            stageFitAssertion,
          },
        }),
      })
      await onPublished(config)
      return true
    } catch (cause) {
      setError(messageFor(cause))
      return false
    } finally {
      setBusy(false)
    }
  }

  return {
    pulseMinutes,
    setPulseMinutes,
    pulseMinutesValid,
    foldRate,
    setFoldRate,
    foldRateValid,
    stageFit,
    setStageFitAssertion,
    stageFitRemaining,
    stageFitConfirmed,
    canPublish,
    busy,
    error,
    reset,
    publish,
  }
}
