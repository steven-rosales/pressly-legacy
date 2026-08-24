import { configError } from '@pressly/errors/factories';
import type { ProductionOrderDueBucket } from './types.ts';

type CalendarDate = Readonly<{ year: number; month: number; day: number }>;
type WallDateTime = CalendarDate &
  Readonly<{
    hour: number;
    minute: number;
    second: number;
    millisecond: number;
  }>;

const dayMilliseconds = 86_400_000;
const hourMilliseconds = 3_600_000;

const timezoneError = (timezone: string, cause?: unknown) =>
  configError({
    code: 'production_timezone_invalid',
    message: `Cannot calculate a local production day in ${timezone}.`,
    safeMessage: 'Production configuration is invalid.',
    ...(cause === undefined ? {} : { cause }),
  });

const wallFromInstant = (timezone: string, instant: number): WallDateTime => {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
      hourCycle: 'h23',
    }).formatToParts(new Date(instant));
  } catch (cause) {
    throw timezoneError(timezone, cause);
  }
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
    millisecond: read('fractionalSecond'),
  };
};

const wallToUtc = (wall: WallDateTime): number =>
  Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    wall.millisecond,
  );

const sameWall = (left: WallDateTime, right: WallDateTime): boolean =>
  left.year === right.year &&
  left.month === right.month &&
  left.day === right.day &&
  left.hour === right.hour &&
  left.minute === right.minute &&
  left.second === right.second &&
  left.millisecond === right.millisecond;

const addDays = (date: CalendarDate, days: number): CalendarDate => {
  const shifted = new Date(
    Date.UTC(date.year, date.month - 1, date.day + days),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
};

const calendarDateAt = (timezone: string, instant: Date): CalendarDate => {
  const wall = wallFromInstant(timezone, instant.getTime());
  return { year: wall.year, month: wall.month, day: wall.day };
};

const startOfDate = (timezone: string, date: CalendarDate): Date => {
  const wall: WallDateTime = {
    ...date,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  };
  const naive = wallToUtc(wall);
  const offsets = new Set(
    Array.from({ length: 13 }, (_, index) => {
      const instant = naive + (-36 + index * 6) * hourMilliseconds;
      return wallToUtc(wallFromInstant(timezone, instant)) - instant;
    }),
  );
  const candidates = [...offsets]
    .map((offset) => naive - offset)
    .filter((instant) => sameWall(wallFromInstant(timezone, instant), wall))
    .sort((left, right) => left - right);
  const first = candidates[0];
  if (first === undefined) throw timezoneError(timezone);
  return new Date(first);
};

const ordinal = (date: CalendarDate): number =>
  Date.UTC(date.year, date.month - 1, date.day);

export const productionDueBucket = (
  dueAt: Date,
  asOf: Date,
  timezone: string,
): ProductionOrderDueBucket => {
  const distance = Math.round(
    (ordinal(calendarDateAt(timezone, dueAt)) -
      ordinal(calendarDateAt(timezone, asOf))) /
      dayMilliseconds,
  );
  if (distance < 0) return 'overdue';
  if (distance === 0) return 'today';
  if (distance === 1) return 'tomorrow';
  return 'later';
};

export const productionDueFilter = (
  bucket: ProductionOrderDueBucket,
  asOf: Date,
  timezone: string,
): Readonly<{ dueAtOrAfter: Date | null; dueBefore: Date | null }> => {
  const reference = calendarDateAt(timezone, asOf);
  if (bucket === 'overdue')
    return {
      dueAtOrAfter: null,
      dueBefore: startOfDate(timezone, reference),
    };
  if (bucket === 'later')
    return {
      dueAtOrAfter: startOfDate(timezone, addDays(reference, 2)),
      dueBefore: null,
    };
  const date = addDays(reference, bucket === 'today' ? 0 : 1);
  return {
    dueAtOrAfter: startOfDate(timezone, date),
    dueBefore: startOfDate(timezone, addDays(date, 1)),
  };
};
