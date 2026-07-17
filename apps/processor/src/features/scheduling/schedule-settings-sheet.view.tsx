import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconLock,
} from "@tabler/icons-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
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
import { useIsMobile } from "@/components/ui/use-mobile"
import { ShiftWindowField } from "./shift-window-field.view"
import { shiftWindowValidationError } from "./shift-window.presenter"

export type ScheduleSettings = Readonly<{
  folders: number
  shiftStartsAt: string
  shiftEndsAt: string
}>

export function ScheduleSettingsSheet({
  mode,
  pulseMinutes,
  foldRate,
  configVersion,
  timezone,
  settings,
  disabled,
  error,
  onApply,
}: Readonly<{
  mode: "create" | "edit"
  pulseMinutes: number
  foldRate: number
  configVersion: number | null
  timezone: string
  settings: ScheduleSettings
  disabled: boolean
  error: string | null
  onApply: (settings: ScheduleSettings) => Promise<boolean>
}>) {
  const { t } = useTranslation()
  const generatedId = useId()
  const foldersDescriptionId = `${generatedId}-folders-description`
  const foldersErrorId = `${generatedId}-folders-error`
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  const foldersError =
    Number.isFinite(draft.folders) && draft.folders > 0
      ? null
      : t("shiftSettings.foldingTeamInvalid")
  const shiftWindowError = shiftWindowValidationError(
    draft.shiftStartsAt,
    draft.shiftEndsAt,
    t
  )
  const valid =
    foldersError === null &&
    shiftWindowError === null &&
    draft.shiftStartsAt.length > 0 &&
    draft.shiftEndsAt.length > 0

  const setSheetOpen = (nextOpen: boolean) => {
    if (saving && !nextOpen) return
    if (nextOpen) setDraft(settings)
    setOpen(nextOpen)
  }

  return (
    <Sheet open={open} onOpenChange={setSheetOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={disabled}
        >
          <IconAdjustmentsHorizontal data-icon="inline-start" />
          {mode === "create"
            ? t("shiftSettings.setShift")
            : t("shiftSettings.editShift")}
        </Button>
      </SheetTrigger>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        size="workspace"
        closeLabel={t("common.close")}
      >
        <SheetHeader className="border-b px-5 py-4 pe-16">
          <SheetTitle>{t("shiftSettings.title")}</SheetTitle>
          <SheetDescription>
            {mode === "create"
              ? t("shiftSettings.createDescription")
              : t("shiftSettings.editDescription")}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-4">
          <section
            className="flex flex-col gap-3"
            aria-labelledby="pulse-title"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 id="pulse-title" className="text-sm font-medium">
                  {t("shiftSettings.publishedPulse")}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("shiftSettings.managedInConfiguration")}
                </p>
              </div>
              {configVersion !== null && (
                <Badge variant="secondary">v{configVersion}</Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/35 p-3">
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("shiftSettings.pulse")}
                </p>
                <p className="mt-1 font-medium tabular-nums">
                  {pulseMinutes} min
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("shiftSettings.foldRate")}
                </p>
                <p className="mt-1 font-medium tabular-nums">
                  {foldRate} lb/min/person
                </p>
              </div>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
              <IconLock /> {t("shiftSettings.publishedReadOnly")}
            </p>
          </section>

          <FieldGroup>
            <Field data-invalid={foldersError !== null || undefined}>
              <FieldLabel htmlFor="schedule-folders">
                {t("shiftSettings.foldingTeam")}
              </FieldLabel>
              <InputGroup className="h-11">
                <InputGroupInput
                  id="schedule-folders"
                  type="number"
                  min={1}
                  value={draft.folders}
                  aria-invalid={foldersError !== null || undefined}
                  aria-describedby={
                    foldersError === null
                      ? foldersDescriptionId
                      : `${foldersDescriptionId} ${foldersErrorId}`
                  }
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      folders: Number(event.target.value),
                    }))
                  }
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{t("shiftSettings.people")}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription id={foldersDescriptionId}>
                {t("shiftSettings.foldingTeamHelp")}
              </FieldDescription>
              {foldersError !== null && (
                <FieldError id={foldersErrorId}>{foldersError}</FieldError>
              )}
            </Field>

            <ShiftWindowField
              id="schedule-shift-window"
              start={draft.shiftStartsAt}
              end={draft.shiftEndsAt}
              timezone={timezone}
              popoverSide={isMobile ? "top" : "left"}
              onStartChange={(shiftStartsAt) =>
                setDraft((current) => ({ ...current, shiftStartsAt }))
              }
              onEndChange={(shiftEndsAt) =>
                setDraft((current) => ({ ...current, shiftEndsAt }))
              }
            />
          </FieldGroup>

          {error !== null && (
            <Alert variant="destructive" role="alert">
              <IconAlertTriangle />
              <AlertTitle>
                {mode === "create"
                  ? t("shiftSettings.createFailed")
                  : t("shiftSettings.saveFailed")}
              </AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <SheetFooter className="border-t px-5 py-4 sm:flex-row sm:justify-end">
          <SheetClose asChild>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={saving}
            >
              {t("common.cancel")}
            </Button>
          </SheetClose>
          <Button
            type="button"
            className="h-11"
            disabled={!valid || saving}
            aria-busy={saving}
            onClick={async () => {
              if (!valid) return
              setSaving(true)
              try {
                if (await onApply(draft)) setOpen(false)
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving && <Spinner data-icon="inline-start" />}
            {saving
              ? mode === "create"
                ? t("shiftSettings.creating")
                : t("shiftSettings.saving")
              : mode === "create"
                ? t("shiftSettings.createAndCompute")
                : t("shiftSettings.saveAndRecompute")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
