import { useState } from "react"
import { IconAlertTriangle, IconGauge, IconLock } from "@tabler/icons-react"
import type { SchedulerConfig } from "@pressly/contracts"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import type { IdempotencyPort } from "@/ports/idempotency.port"
import type { ProductionPort } from "@/ports/production.port"
import { useSchedulerConfigPublication } from "./scheduler-config-publication.model"

const stageFitOptions = [
  ["sortingFits", "Sorting"],
  ["washingFits", "Washing"],
  ["dryingFits", "Drying"],
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
            ? "Publish configuration"
            : "Publish new version"}
        </Button>
      </SheetTrigger>
      <SheetContent
        className="sm:max-w-md"
        showCloseButton={!model.busy}
        aria-busy={model.busy}
      >
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Publish production configuration</SheetTitle>
          <SheetDescription>
            Record a tested pulse as a new immutable scheduler version.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          {model.error !== null && (
            <Alert variant="destructive" role="alert">
              <IconAlertTriangle />
              <AlertTitle>Configuration not published</AlertTitle>
              <AlertDescription>{model.error}</AlertDescription>
            </Alert>
          )}

          <Alert>
            <IconLock />
            <AlertTitle>This creates an immutable version</AlertTitle>
            <AlertDescription>
              Existing plans retain their original configuration. New schedule
              computations use the latest published version.
            </AlertDescription>
          </Alert>

          <FieldGroup>
            <Field
              data-invalid={!model.pulseMinutesValid}
              data-disabled={model.busy}
            >
              <FieldLabel htmlFor="configuration-pulse-minutes">
                Pulse duration
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
                  <InputGroupText>minutes</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription id="configuration-pulse-help">
                The single clock used by every production stage.
              </FieldDescription>
              {!model.pulseMinutesValid && (
                <FieldError id="configuration-pulse-error">
                  Enter a pulse duration of at least 1 minute.
                </FieldError>
              )}
            </Field>

            <Field
              data-invalid={!model.foldRateValid}
              data-disabled={model.busy}
            >
              <FieldLabel htmlFor="configuration-fold-rate">
                Fold rate
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
                  <InputGroupText>lb/min/person</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription id="configuration-fold-help">
                Observed folding and packaging throughput per person.
              </FieldDescription>
              {!model.foldRateValid && (
                <FieldError id="configuration-fold-error">
                  Enter a fold rate greater than 0.
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
              Physical stage fit
            </FieldLegend>
            <FieldDescription id="stage-fit-help">
              Confirm observed floor capability for this exact pulse. Every
              stage must be confirmed before publication.
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
                    {label} finishes within the full{" "}
                    {model.pulseMinutesValid
                      ? model.pulseMinutes
                      : "configured"}
                    -minute pulse.
                  </FieldLabel>
                </Field>
              ))}
            </FieldGroup>
            <FieldDescription id="stage-fit-progress" aria-live="polite">
              {model.stageFitConfirmed
                ? "All three stage confirmations are complete."
                : `${model.stageFitRemaining} ${
                    model.stageFitRemaining === 1
                      ? "confirmation"
                      : "confirmations"
                  } remaining before this version can be published.`}
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
              Cancel
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
            {model.busy ? "Publishing…" : "Publish immutable version"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
