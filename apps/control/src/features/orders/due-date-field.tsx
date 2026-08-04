import { useState } from "react"
import { useTranslation } from "react-i18next"
import { enUS, es } from "date-fns/locale"
import {
  formatInstant,
  instantFromDate,
  instantFromWall,
  toUtcIso,
  wallFromInstant,
} from "@pressly/time"
import { IconCalendarEvent } from "@tabler/icons-react"
import {
  Button,
  Calendar,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui"

const hours = Array.from({ length: 24 }, (_, index) => index)
const minutes = [0, 15, 30, 45] as const
const padded = (value: number) => String(value).padStart(2, "0")

export function DueDateField({
  value,
  timezone,
  disabled = false,
  onChange,
}: {
  value: string
  timezone: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const { t, i18n } = useTranslation()
  const spanish = i18n.resolvedLanguage?.startsWith("es") === true
  const locale = spanish ? "es-US" : "en-US"
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const instant = instantFromDate(new Date(value))
  const wall = wallFromInstant(timezone, instant)
  const selected = new Date(wall.year, wall.month - 1, wall.day)

  const setWall = (next: {
    year?: number
    month?: number
    day?: number
    hour?: number
    minute?: number
  }) => {
    const result = instantFromWall(
      timezone,
      {
        year: next.year ?? wall.year,
        month: next.month ?? wall.month,
        day: next.day ?? wall.day,
        hour: next.hour ?? wall.hour,
        minute: next.minute ?? wall.minute,
      },
      "earlier",
    )
    if (result.tag === "err") {
      setError(t("orders.dueDate.nonexistentTime"))
      return
    }
    setError(null)
    onChange(toUtcIso(result.value))
  }

  return (
    <Field data-invalid={error === null ? undefined : true}>
      <FieldLabel htmlFor="order-due-date">
        {t("orders.dueDate.label")}
      </FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="order-due-date"
            type="button"
            variant="outline"
            className="w-full justify-start"
            aria-invalid={error === null ? undefined : true}
            disabled={disabled}
          >
            <IconCalendarEvent />
            {formatInstant(timezone, instant, {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
              locale,
            })}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <Calendar
            mode="single"
            selected={selected}
            locale={spanish ? es : enUS}
            onSelect={(date) => {
              if (date === undefined) return
              setWall({
                year: date.getFullYear(),
                month: date.getMonth() + 1,
                day: date.getDate(),
              })
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      <div className="grid grid-cols-2 gap-2">
        <Select
          value={String(wall.hour)}
          onValueChange={(next) => setWall({ hour: Number(next) })}
          disabled={disabled}
        >
          <SelectTrigger
            aria-label={t("orders.dueDate.hour")}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {hours.map((hour) => (
                <SelectItem key={hour} value={String(hour)}>
                  {new Intl.DateTimeFormat(locale, {
                    hour: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(Date.UTC(2026, 0, 1, hour)))}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          value={String(wall.minute)}
          onValueChange={(next) => setWall({ minute: Number(next) })}
          disabled={disabled}
        >
          <SelectTrigger
            aria-label={t("orders.dueDate.minute")}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {minutes.map((minute) => (
                <SelectItem key={minute} value={String(minute)}>
                  :{padded(minute)}
                </SelectItem>
              ))}
              {!minutes.includes(wall.minute as (typeof minutes)[number]) && (
                <SelectItem value={String(wall.minute)}>
                  :{padded(wall.minute)}
                </SelectItem>
              )}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <FieldDescription>
        {t("orders.dueDate.description", { timezone })}
      </FieldDescription>
      {error !== null && <FieldError>{error}</FieldError>}
    </Field>
  )
}
