import { useState } from "react"
import { useTranslation } from "react-i18next"
import { IconAlertTriangle, IconGauge, IconLock } from "@tabler/icons-react"
import type { SchedulerConfig } from "@pressly/production-system/contracts/read-models/production-schedule"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../browser/components/ui/alert"
import { Button } from "../../browser/components/ui/button"
import { Checkbox } from "../../browser/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "../../browser/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "../../browser/components/ui/input-group"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../../browser/components/ui/sheet"
import { Spinner } from "../../browser/components/ui/spinner"
import { useIsMobile } from "../../browser/components/ui/use-mobile"
import type { IdempotencyPort } from "../../capabilities/idempotency.port"
import type { ProductionPort } from "../../capabilities/production.port"
import { useSchedulerConfigPublication } from "./scheduler-config-publication.model"

const stageFitOptions = [
  ["sortingFits", "settings.sorting"],
  ["washingFits", "settings.washing"],
  ["dryingFits", "settings.drying"],
] as const

export function SchedulerConfigPublication({
  production,
  idempotency,
  locationId,
  currentConfig,
  canManage,
  onPublished,
}: Readonly<{
  production: ProductionPort
  idempotency: IdempotencyPort
  locationId: string
  currentConfig: SchedulerConfig | null
  canManage: boolean
  onPublished: (config: SchedulerConfig) => Promise<void>
}>) {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const model = useSchedulerConfigPublication({
    production,
    idempotency,
    locationId,
    currentConfig,
    onPublished,
  })

  const setSheetOpen = (nextOpen: boolean) => {
    if (model.busy && !nextOpen) return
    if (nextOpen) model.reset()
    setOpen(nextOpen)
  }

  return (
    <Sheet open={open} onOpenChange={setSheetOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant={currentConfig === null ? "default" : "outline"}
          className="min-h-11 w-full justify-self-start px-4 sm:w-auto"
          disabled={!canManage}
        >
          {currentConfig === null
            ? t("settings.publishConfiguration")
            : t("settings.publishNewVersion")}
        </Button>
      </SheetTrigger>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        size="workspace"
        showCloseButton={!model.busy}
        closeLabel={t("common.close")}
        aria-busy={model.busy}
      >
        <SheetHeader className="border-b px-5 py-4 pe-16">
          <SheetTitle>{t("settings.publishTitle")}</SheetTitle>
          <SheetDescription>
            {t("settings.publishDescription")}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          {model.error !== null && (
            <Alert variant="destructive" role="alert">
              <IconAlertTriangle />
              <AlertTitle>{t("settings.publishFailed")}</AlertTitle>
              <AlertDescription>{model.error}</AlertDescription>
            </Alert>
          )}

          <Alert>
            <IconLock />
            <AlertTitle>{t("settings.immutableTitle")}</AlertTitle>
            <AlertDescription>
              {t("settings.immutableDescription")}
            </AlertDescription>
          </Alert>

          <FieldGroup>
            <Field
              data-invalid={!model.pulseMinutesValid}
              data-disabled={model.busy}
            >
              <FieldLabel htmlFor="configuration-pulse-minutes">
                {t("settings.pulseDuration")}
              </FieldLabel>
              <InputGroup className="h-11">
                <InputGroupInput
                  id="configuration-pulse-minutes"
                  type="number"
                  min={1}
                  value={model.pulseMinutes}
                  disabled={model.busy}
                  aria-invalid={model.pulseMinutesValid ? undefined : true}
                  aria-describedby={
                    model.pulseMinutesValid
                      ? "configuration-pulse-help"
                      : "configuration-pulse-help configuration-pulse-error"
                  }
                  onChange={(event) =>
                    model.setPulseMinutes(Number(event.target.value))
                  }
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{t("common.minutesUnit")}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription id="configuration-pulse-help">
                {t("settings.pulseHelp")}
              </FieldDescription>
              {!model.pulseMinutesValid && (
                <FieldError id="configuration-pulse-error">
                  {t("settings.pulseInvalid")}
                </FieldError>
              )}
            </Field>

            <Field
              data-invalid={!model.foldRateValid}
              data-disabled={model.busy}
            >
              <FieldLabel htmlFor="configuration-fold-rate">
                {t("settings.foldRate")}
              </FieldLabel>
              <InputGroup className="h-11">
                <InputGroupInput
                  id="configuration-fold-rate"
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={model.foldRate}
                  disabled={model.busy}
                  aria-invalid={model.foldRateValid ? undefined : true}
                  aria-describedby={
                    model.foldRateValid
                      ? "configuration-fold-help"
                      : "configuration-fold-help configuration-fold-error"
                  }
                  onChange={(event) =>
                    model.setFoldRate(Number(event.target.value))
                  }
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>
                    {t("settings.foldingRateUnit")}
                  </InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription id="configuration-fold-help">
                {t("settings.foldRateHelp")}
              </FieldDescription>
              {!model.foldRateValid && (
                <FieldError id="configuration-fold-error">
                  {t("settings.foldRateInvalid")}
                </FieldError>
              )}
            </Field>
          </FieldGroup>

          <FieldSet
            className="flex flex-col gap-3 rounded-xl border bg-muted/35 p-4"
            disabled={model.busy}
            aria-describedby="stage-fit-help stage-fit-progress"
          >
            <FieldLegend className="mb-0 flex items-center gap-2 text-sm">
              <IconGauge className="size-4 shrink-0" aria-hidden="true" />
              {t("settings.physicalStageFit")}
            </FieldLegend>
            <FieldDescription id="stage-fit-help">
              {t("settings.physicalStageFitHelp")}
            </FieldDescription>
            <FieldGroup className="gap-3">
              {stageFitOptions.map(([key, label]) => (
                <Field
                  key={key}
                  orientation="horizontal"
                  data-disabled={model.busy}
                >
                  <Checkbox
                    id={"configuration-" + key}
                    checked={model.stageFit[key]}
                    disabled={model.busy}
                    onCheckedChange={(checked) =>
                      model.setStageFitAssertion(key, checked === true)
                    }
                  />
                  <FieldLabel
                    htmlFor={"configuration-" + key}
                    className="font-normal"
                  >
                    {t("settings.stageFits", {
                      stage: t(label),
                      minutes: model.pulseMinutesValid
                        ? model.pulseMinutes
                        : t("settings.configured"),
                    })}
                  </FieldLabel>
                </Field>
              ))}
            </FieldGroup>
            <FieldDescription id="stage-fit-progress" aria-live="polite">
              {model.stageFitConfirmed
                ? t("settings.confirmationsComplete")
                : t("settings.confirmationsRemaining", {
                    count: model.stageFitRemaining,
                  })}
            </FieldDescription>
          </FieldSet>
        </div>

        <SheetFooter className="border-t px-5 py-4 sm:flex-row sm:justify-end">
          <SheetClose asChild>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={model.busy}
            >
              {t("common.cancel")}
            </Button>
          </SheetClose>
          <Button
            type="button"
            className="h-11"
            disabled={!model.canPublish}
            onClick={() =>
              void model.publish().then((published) => {
                if (published) setOpen(false)
              })
            }
          >
            {model.busy && (
              <Spinner data-icon="inline-start" aria-hidden="true" />
            )}
            {model.busy
              ? t("settings.publishing")
              : t("settings.publishImmutable")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
