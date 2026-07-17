import { useId } from "react"
import { useTranslation } from "react-i18next"
import { IconCalendarEvent, IconWorld } from "@tabler/icons-react"
import { enUS, es } from "date-fns/locale"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  parseLocalDateTime,
  shiftWindowValidationError,
} from "./shift-window.presenter"
import { localeForLanguage } from "./scheduling.presenter"

export type ShiftWindowFieldProps = Readonly<{
  start: string
  end: string
  timezone: string
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  disabled?: boolean
  id?: string
  popoverSide?: "top" | "right" | "bottom" | "left"
}>

const toCalendarDate = (date: string): Date | undefined => {
  const parts = parseLocalDateTime(`${date}T12:00`)
  if (!parts) return undefined
  const [year, month, day] = parts.date.split("-").map(Number)
  return new Date(year, month - 1, day, 12)
}

const toDateKey = (date: Date): string =>
  [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")

const addDays = (date: string, amount: number): string => {
  const calendarDate = toCalendarDate(date)
  if (!calendarDate) return date
  calendarDate.setDate(calendarDate.getDate() + amount)
  return toDateKey(calendarDate)
}

const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

const formatTime = (time: string, locale: string): string => {
  const [hours, minutes] = time.split(":").map(Number)
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hours, minutes))
}

const formatDate = (
  date: string,
  style: "short" | "long",
  locale: string
): string => {
  const calendarDate = toCalendarDate(date)
  if (!calendarDate) return date
  return new Intl.DateTimeFormat(locale, {
    month: style === "short" ? "short" : "long",
    day: "numeric",
    year: "numeric",
  }).format(calendarDate)
}

const makeTimeOptions = (locale: string) =>
  Array.from({ length: 48 }, (_, index) => {
    const hours = Math.floor(index / 2)
    const minutes = (index % 2) * 30
    const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
    return { value, label: formatTime(value, locale) }
  })

const optionsIncluding = (
  value: string,
  timeOptions: ReturnType<typeof makeTimeOptions>,
  locale: string
) => {
  if (timeOptions.some((option) => option.value === value)) return timeOptions
  return [...timeOptions, { value, label: formatTime(value, locale) }].sort(
    (a, b) => a.value.localeCompare(b.value)
  )
}

const deriveWindow = (date: string, startTime: string, endTime: string) => {
  const overnight = timeToMinutes(endTime) < timeToMinutes(startTime)
  return {
    start: `${date}T${startTime}`,
    end: `${overnight ? addDays(date, 1) : date}T${endTime}`,
  }
}

export function ShiftWindowField({
  start,
  end,
  timezone,
  onStartChange,
  onEndChange,
  disabled = false,
  id,
  popoverSide = "top",
}: ShiftWindowFieldProps) {
  const { t, i18n } = useTranslation()
  const locale = localeForLanguage(i18n.resolvedLanguage)
  const timeOptions = makeTimeOptions(locale)
  const generatedId = useId()
  const controlId = id ?? `shift-window-${generatedId}`
  const startTimeId = `${controlId}-start-time`
  const endTimeId = `${controlId}-end-time`
  const descriptionId = `${controlId}-description`
  const errorId = `${controlId}-error`
  const popoverDescriptionId = `${controlId}-popover-description`
  const startParts = parseLocalDateTime(start)
  const endParts = parseLocalDateTime(end)
  const selectedDate = startParts?.date ?? endParts?.date ?? ""
  const startTime = startParts?.time ?? "08:00"
  const endTime = endParts?.time ?? "16:00"
  const isOvernight =
    startParts !== null &&
    endParts !== null &&
    endParts.date !== startParts.date
  const startOptions = optionsIncluding(startTime, timeOptions, locale)
  const endOptions = optionsIncluding(endTime, timeOptions, locale)
  const dateLabel = selectedDate
    ? formatDate(selectedDate, "short", locale)
    : t("shiftWindow.date")
  const summary = `${dateLabel} · ${formatTime(startTime, locale)} → ${formatTime(endTime, locale)}${isOvernight ? ` · ${t("shiftWindow.nextDay")}` : ""}`
  const validationError = shiftWindowValidationError(start, end, t)
  const describedBy = validationError
    ? `${descriptionId} ${errorId}`
    : descriptionId

  const updateWindow = (
    nextDate: string,
    nextStartTime: string,
    nextEndTime: string
  ) => {
    const next = deriveWindow(nextDate, nextStartTime, nextEndTime)
    onStartChange(next.start)
    onEndChange(next.end)
  }

  return (
    <Field
      data-disabled={disabled || undefined}
      data-invalid={validationError !== null || undefined}
    >
      <FieldLabel htmlFor={controlId}>{t("shiftWindow.title")}</FieldLabel>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={controlId}
            type="button"
            variant="outline"
            className="h-11 w-full justify-start px-3 font-normal"
            disabled={disabled}
            aria-invalid={validationError !== null || undefined}
            aria-describedby={describedBy}
            aria-label={t("shiftWindow.ariaLabel", {
              date: selectedDate
                ? formatDate(selectedDate, "long", locale)
                : t("shiftWindow.chooseDate"),
              start: formatTime(startTime, locale),
              end: formatTime(endTime, locale),
              nextDay: isOvernight ? ` ${t("shiftWindow.nextDay")}` : "",
              timezone,
            })}
          >
            <IconCalendarEvent data-icon="inline-start" />
            <span className="truncate">{summary}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side={popoverSide}
          align="center"
          sideOffset={8}
          collisionPadding={8}
          className="max-h-[var(--radix-popover-content-available-height)] w-[calc(100vw-1rem)] max-w-[22rem] overflow-y-auto overscroll-contain p-3 sm:w-[22rem]"
          aria-label={t("shiftWindow.chooseDateAndTimes")}
          aria-describedby={popoverDescriptionId}
        >
          <PopoverHeader>
            <PopoverTitle>{t("shiftWindow.title")}</PopoverTitle>
            <PopoverDescription id={popoverDescriptionId}>
              {t("shiftWindow.description")}
            </PopoverDescription>
          </PopoverHeader>
          <Calendar
            mode="single"
            locale={i18n.resolvedLanguage === "es" ? es : enUS}
            selected={selectedDate ? toCalendarDate(selectedDate) : undefined}
            defaultMonth={
              selectedDate ? toCalendarDate(selectedDate) : undefined
            }
            onSelect={(date) => {
              if (date) updateWindow(toDateKey(date), startTime, endTime)
            }}
            className="mx-auto w-fit max-w-full p-0 [--cell-size:--spacing(10)] sm:[--cell-size:--spacing(11)]"
            classNames={{
              month: "flex w-full flex-col gap-2",
              week: "mt-1 flex w-full",
            }}
          />
          <FieldGroup className="grid grid-cols-2 gap-3">
            <Field data-invalid={validationError !== null || undefined}>
              <FieldLabel htmlFor={startTimeId}>
                {t("shiftWindow.startTime")}
              </FieldLabel>
              <Select
                value={startTime}
                onValueChange={(value) => {
                  if (selectedDate) updateWindow(selectedDate, value, endTime)
                }}
                disabled={disabled || !selectedDate}
              >
                <SelectTrigger
                  id={startTimeId}
                  className="h-11 w-full"
                  aria-invalid={validationError !== null || undefined}
                  aria-describedby={describedBy}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectGroup>
                    {startOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="h-11"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field data-invalid={validationError !== null || undefined}>
              <div className="flex min-h-5 items-center justify-between gap-2">
                <FieldLabel htmlFor={endTimeId}>
                  {t("shiftWindow.endTime")}
                </FieldLabel>
                {isOvernight && (
                  <Badge variant="secondary">
                    {t("shiftWindow.nextDayBadge")}
                  </Badge>
                )}
              </div>
              <Select
                value={endTime}
                onValueChange={(value) => {
                  if (selectedDate) updateWindow(selectedDate, startTime, value)
                }}
                disabled={disabled || !selectedDate}
              >
                <SelectTrigger
                  id={endTimeId}
                  className="h-11 w-full"
                  aria-invalid={validationError !== null || undefined}
                  aria-describedby={describedBy}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectGroup>
                    {endOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="h-11"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <IconWorld />
            {t("shiftWindow.localTime", { timezone })}
          </div>
        </PopoverContent>
      </Popover>
      <FieldDescription id={descriptionId}>
        {isOvernight ? t("shiftWindow.overnight") : t("shiftWindow.sameDay")}{" "}
        {"·"} {timezone}
      </FieldDescription>
      {validationError !== null && (
        <FieldError id={errorId}>{validationError}</FieldError>
      )}
    </Field>
  )
}
