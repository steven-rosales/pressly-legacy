import type { ServiceDayWindow } from './types.ts';

type CalendarDate = Readonly<{ year: number; month: number; day: number }>;
type WallDateTime = CalendarDate &
  Readonly<{
    hour: number;
    minute: number;
    second: number;
    millisecond: number;
  }>;

const hourMilliseconds = 60 * 60 * 1_000;
const dayMilliseconds = 24 * hourMilliseconds;

export const parseProductionServiceDay = (
  value: string,
): CalendarDate | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  return normalized.getUTCFullYear() === year &&
    normalized.getUTCMonth() + 1 === month &&
    normalized.getUTCDate() === day
    ? { year, month, day }
    : null;
};

const addCalendarDays = (date: CalendarDate, days: number): CalendarDate => {
  const shifted = new Date(
    Date.UTC(date.year, date.month - 1, date.day + days),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
};

const wallFromInstant = (timezone: string, instant: number): WallDateTime => {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
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

const wallUtcMilliseconds = (wall: WallDateTime): number =>
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

const startOfCalendarDate = (
  timezone: string,
  date: CalendarDate,
): Date | null => {
  const wall: WallDateTime = {
    ...date,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  };
  const naiveUtc = wallUtcMilliseconds(wall);
  const offsets = new Set(
    Array.from({ length: 13 }, (_, index) => {
      const sample = naiveUtc + (-36 + index * 6) * hourMilliseconds;
      return wallUtcMilliseconds(wallFromInstant(timezone, sample)) - sample;
    }),
  );
  const candidates = [...offsets]
    .map((offset) => naiveUtc - offset)
    .filter((instant) => sameWall(wallFromInstant(timezone, instant), wall))
    .sort((left, right) => left - right);
  return candidates[0] === undefined ? null : new Date(candidates[0]);
};

export const productionServiceDayWindow = (input: {
  timezone: string;
  asOf: Date;
  serviceDay: string;
}): ServiceDayWindow | null => {
  const selected = parseProductionServiceDay(input.serviceDay);
  if (selected === null) return null;
  const reference = wallFromInstant(input.timezone, input.asOf.getTime());
  const distance = Math.round(
    (Date.UTC(selected.year, selected.month - 1, selected.day) -
      Date.UTC(reference.year, reference.month - 1, reference.day)) /
      dayMilliseconds,
  );
  const date = addCalendarDays(
    { year: reference.year, month: reference.month, day: reference.day },
    distance,
  );
  const startsAt = startOfCalendarDate(input.timezone, date);
  const endsAt = startOfCalendarDate(input.timezone, addCalendarDays(date, 1));
  return startsAt === null || endsAt === null ? null : { startsAt, endsAt };
};
