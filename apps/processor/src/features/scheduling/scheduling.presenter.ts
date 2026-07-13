const zonedParts = (value: Date, timeZone: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  )

export const formatZonedDateTimeInput = (
  iso: string,
  timeZone: string
): string => {
  const parts = zonedParts(new Date(iso), timeZone)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

const parseLocalDateTime = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (match === null)
    throw new TypeError("Enter a complete local date and time.")
  const [, year, month, day, hour, minute] = match
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  }
}

const offsetAt = (timestamp: number, timeZone: string): number => {
  const date = new Date(timestamp)
  const parts = zonedParts(date, timeZone)
  const representedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  )
  return representedAsUtc - Math.floor(timestamp / 1_000) * 1_000
}

export const zonedDateTimeInputToIso = (
  value: string,
  timeZone: string
): string => {
  const parts = parseLocalDateTime(value)
  const desiredAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute
  )
  let timestamp = desiredAsUtc
  for (let pass = 0; pass < 3; pass += 1)
    timestamp = desiredAsUtc - offsetAt(timestamp, timeZone)

  const iso = new Date(timestamp).toISOString()
  if (formatZonedDateTimeInput(iso, timeZone) !== value)
    throw new TypeError("That local time does not exist in this location.")
  return iso
}
