import {
  addCalendarDays,
  calendarDateAt,
  instantFromDate,
  instantFromWall,
  toUtcIso,
  type ZoneId,
} from "@pressly/time"

const backlogAgeDays = 30

export const defaultOrderResolutionCutoffDate = (
  timezone: string,
  now = new Date()
): Date => {
  const locationDate = addCalendarDays(
    calendarDateAt(timezone as ZoneId, instantFromDate(now)),
    -backlogAgeDays
  )

  return new Date(locationDate.year, locationDate.month - 1, locationDate.day)
}

export const orderResolutionCutoffIso = (
  date: Date,
  timezone: string
): string | null => {
  try {
    const cutoff = instantFromWall(
      timezone as ZoneId,
      {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: 23,
        minute: 59,
        second: 59,
        millisecond: 999,
      },
      "later"
    )

    return cutoff.tag === "ok" ? toUtcIso(cutoff.value) : null
  } catch {
    return null
  }
}
