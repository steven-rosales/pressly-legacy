import { useId, useState, useSyncExternalStore } from "react"
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
import { cn } from "@/components/ui/class-names"
import { Spinner } from "@/components/ui/spinner"
import { ShiftWindowField } from "./shift-window-field.view"
import { shiftWindowValidationError } from "./shift-window.presenter"

const mobileSheetQuery = "(max-width: 767px)"

const mobileSheetSnapshot = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(mobileSheetQuery).matches

const subscribeToMobileSheet = (onStoreChange: () => void) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return () => undefined
  const media = window.matchMedia(mobileSheetQuery)
  media.addEventListener("change", onStoreChange)
  return () => media.removeEventListener("change", onStoreChange)
}

const useMobileSheet = () =>
  useSyncExternalStore(subscribeToMobileSheet, mobileSheetSnapshot, () => false)

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
  const generatedId = useId()
  const foldersDescriptionId = `${generatedId}-folders-description`
  const foldersErrorId = `${generatedId}-folders-error`
  const isMobile = useMobileSheet()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  const foldersError =
    Number.isFinite(draft.folders) && draft.folders > 0
      ? null
      : "Enter at least one person for the folding team."
  const shiftWindowError = shiftWindowValidationError(
    draft.shiftStartsAt,
    draft.shiftEndsAt
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
          {mode === "create" ? "Set shift" : "Edit shift"}
        </Button>
      </SheetTrigger>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          isMobile
            ? "max-h-[calc(100dvh-0.5rem)] w-full rounded-t-xl"
            : "sm:max-w-md"
        )}
      >
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Shift settings</SheetTitle>
          <SheetDescription>
            {mode === "create"
              ? "Set the next shift without changing the tested production pulse."
              : "Adjust this shift without changing the tested production pulse."}
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
                  Published pulse
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Floor capability is managed in Configuration.
                </p>
              </div>
              {configVersion !== null && (
                <Badge variant="secondary">v{configVersion}</Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/35 p-3">
              <div>
                <p className="text-xs text-muted-foreground">Pulse</p>
                <p className="mt-1 font-medium tabular-nums">
                  {pulseMinutes} min
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Fold rate</p>
                <p className="mt-1 font-medium tabular-nums">
                  {foldRate} lb/min/person
                </p>
              </div>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
              <IconLock /> Published values are read-only during scheduling.
            </p>
          </section>

          <FieldGroup>
            <Field data-invalid={foldersError !== null || undefined}>
              <FieldLabel htmlFor="schedule-folders">Folding team</FieldLabel>
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
                  <InputGroupText>people</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription id={foldersDescriptionId}>
                Effective people available for folding and packaging.
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
                  ? "The shift was not created"
                  : "Shift changes were not saved"}
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
              Cancel
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
                ? "Creating…"
                : "Saving…"
              : mode === "create"
                ? "Create & compute"
                : "Save & recompute"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
