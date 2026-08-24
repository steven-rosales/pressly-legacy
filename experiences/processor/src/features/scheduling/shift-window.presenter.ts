import type { TFunction } from "i18next"

export type LocalDateTimeParts = Readonly<{
  date: string
  time: string
}>

const localDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/

export const parseLocalDateTime = (
  value: string
): LocalDateTimeParts | null => {
  const match = localDateTimePattern.exec(value)
  if (!match) return null

  const [, year, month, day, hours, minutes] = match
  const candidate = new Date(Number(year), Number(month) - 1, Number(day), 12)
  if (
    candidate.getFullYear() !== Number(year) ||
    candidate.getMonth() !== Number(month) - 1 ||
    candidate.getDate() !== Number(day)
  )
    return null

  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  }
}

export const shiftWindowValidationError = (
  start: string,
  end: string,
  t?: TFunction
): string | null => {
  const startParts = parseLocalDateTime(start)
  const endParts = parseLocalDateTime(end)
  if (startParts === null || endParts === null)
    return (
      t?.("shiftWindow.incomplete") ?? "Choose a complete shift date and times."
    )
  if (startParts.time === endParts.time)
    return (
      t?.("shiftWindow.equalTimes") ??
      "Start and end time must be different; equal times would create a 24-hour shift."
    )
  return null
}
