import { useId } from "react"
import { IconCalendarEvent, IconWorld } from "@tabler/icons-react"
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

const formatTime = (time: string): string => {
  const [hours, minutes] = time.split(":").map(Number)
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hours, minutes))
}

const formatDate = (date: string, style: "short" | "long"): string => {
  const calendarDate = toCalendarDate(date)
  if (!calendarDate) return date
  return new Intl.DateTimeFormat("en-US", {
    month: style === "short" ? "short" : "long",
    day: "numeric",
    year: "numeric",
  }).format(calendarDate)
}

const timeOptions = Array.from({ length: 48 }, (_, index) => {
  const hours = Math.floor(index / 2)
  const minutes = (index % 2) * 30
  const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
  return { value, label: formatTime(value) }
})

const optionsIncluding = (value: string) => {
  if (timeOptions.some((option) => option.value === value)) return timeOptions
  return [...timeOptions, { value, label: formatTime(value) }].sort((a, b) =>
    a.value.localeCompare(b.value)
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
  const startOptions = optionsIncluding(startTime)
  const endOptions = optionsIncluding(endTime)
  const dateLabel = selectedDate ? formatDate(selectedDate, "short") : "Date"
  const summary = `${dateLabel} · ${formatTime(startTime)} → ${formatTime(endTime)}${isOvernight ? " · next day" : ""}`
  const validationError = shiftWindowValidationError(start, end)
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
      <FieldLabel htmlFor={controlId}>Shift window</FieldLabel>
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
            aria-label={`Shift window: ${selectedDate ? formatDate(selectedDate, "long") : "choose a date"}, ${formatTime(startTime)} to ${formatTime(endTime)}${isOvernight ? " the next day" : ""}. Local time in ${timezone}.`}
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
          aria-label="Choose shift date and times"
          aria-describedby={popoverDescriptionId}
        >
          <PopoverHeader>
            <PopoverTitle>Shift window</PopoverTitle>
            <PopoverDescription id={popoverDescriptionId}>
              Choose the working date, then set the floor start and end times.
            </PopoverDescription>
          </PopoverHeader>
          <Calendar
            mode="single"
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
              <FieldLabel htmlFor={startTimeId}>Start time</FieldLabel>
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
                <FieldLabel htmlFor={endTimeId}>End time</FieldLabel>
                {isOvernight && <Badge variant="secondary">Next day</Badge>}
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
            Local time · {timezone}
          </div>
        </PopoverContent>
      </Popover>
      <FieldDescription id={descriptionId}>
        {isOvernight ? "Overnight shift" : "Same-day shift"} · {timezone}
      </FieldDescription>
      {validationError !== null && (
        <FieldError id={errorId}>{validationError}</FieldError>
      )}
    </Field>
  )
}
