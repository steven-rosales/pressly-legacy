import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { SchedulerConfig } from "@pressly/contracts"
import type { IdempotencyPort } from "@/ports/idempotency.port"
import type { ProductionPort } from "@/ports/production.port"
import { presentSettingsError } from "./settings.error.presenter"

const initialPulseMinutes = 56
const initialFoldRate = 2

type StageFitKey = "sortingFits" | "washingFits" | "dryingFits"

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
  const { t } = useTranslation()
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
      setError(t("settings.positiveValuesRequired"))
      return false
    }
    if (!stageFitConfirmed) {
      setError(t("settings.stageFitRequired"))
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
      setError(presentSettingsError(cause, t))
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
