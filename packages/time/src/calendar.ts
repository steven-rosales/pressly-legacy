import { result, type Result } from '@pressly/kernel';
import { instantFromWall, wallFromInstant } from './convert.ts';
import type { InstantMs, TimeError, ZoneId } from './types.ts';

const MILLISECONDS_PER_CALENDAR_DAY = 86_400_000;

export type CalendarDate = Readonly<{
  year: number;
  month: number;
  day: number;
}>;

export type CalendarDayRange = Readonly<{
  startsAt: InstantMs;
  endsAt: InstantMs;
}>;

const calendarOrdinal = (date: CalendarDate): number =>
  Date.UTC(date.year, date.month - 1, date.day);

export const calendarDateAt = (
  zone: ZoneId,
  instant: InstantMs,
): CalendarDate => {
  const wall = wallFromInstant(zone, instant);
  return { year: wall.year, month: wall.month, day: wall.day };
};

export const addCalendarDays = (
  date: CalendarDate,
  days: number,
): CalendarDate => {
  const shifted = new Date(
    Date.UTC(date.year, date.month - 1, date.day + days),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
};

export const calendarDayDistance = (input: {
  from: CalendarDate;
  to: CalendarDate;
}): number =>
  Math.round(
    (calendarOrdinal(input.to) - calendarOrdinal(input.from)) /
      MILLISECONDS_PER_CALENDAR_DAY,
  );

const startOfCalendarDate = (
  zone: ZoneId,
  date: CalendarDate,
): Result<InstantMs, TimeError> =>
  instantFromWall(
    zone,
    {
      ...date,
      hour: 0,
      minute: 0,
    },
    'earlier',
  );

export const calendarDayRangeAt = (
  zone: ZoneId,
  reference: InstantMs,
  dayOffset = 0,
): Result<CalendarDayRange, TimeError> => {
  const date = addCalendarDays(calendarDateAt(zone, reference), dayOffset);
  const startsAt = startOfCalendarDate(zone, date);
  if (result.isErr(startsAt)) return startsAt;

  const endsAt = startOfCalendarDate(zone, addCalendarDays(date, 1));
  if (result.isErr(endsAt)) return endsAt;

  return result.ok({ startsAt: startsAt.value, endsAt: endsAt.value });
};
