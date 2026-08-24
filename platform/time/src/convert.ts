import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import type {
  InstantMs,
  NormalizedWallDateTime,
  TimeError,
  UtcIso,
  WallDateTime,
  WallDisambiguation,
  ZoneId,
} from './types.ts';

const HOUR_MS = 60 * 60 * 1000;

const normalizeWall = (wall: WallDateTime): NormalizedWallDateTime => ({
  year: wall.year,
  month: wall.month,
  day: wall.day,
  hour: wall.hour,
  minute: wall.minute,
  second: wall.second ?? 0,
  millisecond: wall.millisecond ?? 0,
});

const wallToUtcMs = (wall: NormalizedWallDateTime): number =>
  Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    wall.millisecond,
  );

const sameWall = (
  left: NormalizedWallDateTime,
  right: NormalizedWallDateTime,
): boolean =>
  left.year === right.year &&
  left.month === right.month &&
  left.day === right.day &&
  left.hour === right.hour &&
  left.minute === right.minute &&
  left.second === right.second &&
  left.millisecond === right.millisecond;

const isValidWall = (wall: NormalizedWallDateTime): boolean => {
  if (
    !Number.isInteger(wall.year) ||
    !Number.isInteger(wall.month) ||
    !Number.isInteger(wall.day) ||
    !Number.isInteger(wall.hour) ||
    !Number.isInteger(wall.minute) ||
    !Number.isInteger(wall.second) ||
    !Number.isInteger(wall.millisecond)
  ) {
    return false;
  }

  if (
    wall.month < 1 ||
    wall.month > 12 ||
    wall.day < 1 ||
    wall.day > 31 ||
    wall.hour < 0 ||
    wall.hour > 23 ||
    wall.minute < 0 ||
    wall.minute > 59 ||
    wall.second < 0 ||
    wall.second > 59 ||
    wall.millisecond < 0 ||
    wall.millisecond > 999
  ) {
    return false;
  }

  const asDate = new Date(wallToUtcMs(wall));

  return (
    asDate.getUTCFullYear() === wall.year &&
    asDate.getUTCMonth() + 1 === wall.month &&
    asDate.getUTCDate() === wall.day &&
    asDate.getUTCHours() === wall.hour &&
    asDate.getUTCMinutes() === wall.minute &&
    asDate.getUTCSeconds() === wall.second &&
    asDate.getUTCMilliseconds() === wall.millisecond
  );
};

export const wallFromInstant = (
  zone: ZoneId,
  instant: InstantMs,
): NormalizedWallDateTime => {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value;
    return Number(value);
  };

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

const offsetMsAt = (zone: ZoneId, instant: InstantMs): number => {
  const wall = wallFromInstant(zone, instant);
  return wallToUtcMs(wall) - instant;
};

const uniqueNumbers = (values: readonly number[]): readonly number[] => [
  ...new Set(values),
];

const UTC_ISO_PATTERN =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<millisecond>\d{1,3}))?Z$/;

export const toUtcIso = (instant: InstantMs): UtcIso =>
  new Date(instant).toISOString() as UtcIso;

export const instantFromDate = (date: Date): InstantMs =>
  date.getTime() as InstantMs;

export const utcIsoFromDate = (date: Date): UtcIso =>
  toUtcIso(instantFromDate(date));

export const instantFromUtcIso = (
  value: string,
): Result<InstantMs, TimeError> => {
  const match = UTC_ISO_PATTERN.exec(value);

  if (match?.groups === undefined)
    return result.err({ tag: 'InvalidUtcIso', value });

  const wall: NormalizedWallDateTime = {
    year: Number(match.groups['year']),
    month: Number(match.groups['month']),
    day: Number(match.groups['day']),
    hour: Number(match.groups['hour']),
    minute: Number(match.groups['minute']),
    second: Number(match.groups['second']),
    millisecond: Number((match.groups['millisecond'] ?? '0').padEnd(3, '0')),
  };

  if (!isValidWall(wall)) return result.err({ tag: 'InvalidUtcIso', value });

  return result.ok(wallToUtcMs(wall) as InstantMs);
};

export const isUtcIso = (value: string): value is UtcIso =>
  result.isOk(instantFromUtcIso(value));

export const possibleInstantsFromWall = (
  zone: ZoneId,
  wallInput: WallDateTime,
): Result<readonly InstantMs[], TimeError> => {
  const wall = normalizeWall(wallInput);

  if (!isValidWall(wall))
    return result.err({ tag: 'InvalidWallDateTime', value: wallInput });

  const naiveUtcMs = wallToUtcMs(wall);

  const sampleInstants = Array.from({ length: 13 }, (_, index) => {
    const hoursFromCenter = -36 + index * 6;
    return (naiveUtcMs + hoursFromCenter * HOUR_MS) as InstantMs;
  });

  const candidateOffsets = uniqueNumbers(
    sampleInstants.map((instant) => offsetMsAt(zone, instant)),
  );

  const candidates = candidateOffsets
    .map((offset) => (naiveUtcMs - offset) as InstantMs)
    .filter((instant) => sameWall(wallFromInstant(zone, instant), wall))
    .sort((left, right) => left - right);

  return result.ok(candidates);
};

export const instantFromWall = (
  zone: ZoneId,
  wallInput: WallDateTime,
  disambiguation: WallDisambiguation = 'reject',
): Result<InstantMs, TimeError> => {
  const wall = normalizeWall(wallInput);
  const candidatesResult = possibleInstantsFromWall(zone, wallInput);

  if (result.isErr(candidatesResult)) return candidatesResult;

  const candidates = candidatesResult.value;
  const firstCandidate = candidates[0];

  if (firstCandidate === undefined)
    return result.err({
      tag: 'NonexistentWallDateTime',
      zone,
      value: wall,
    });

  if (candidates.length === 1) return result.ok(firstCandidate);

  if (disambiguation === 'earlier') return result.ok(firstCandidate);

  if (disambiguation === 'later')
    return result.ok(candidates[candidates.length - 1] ?? firstCandidate);

  return result.err({
    tag: 'AmbiguousWallDateTime',
    zone,
    value: wall,
    candidates: candidates.map(toUtcIso),
  });
};

export type FormatOptions = Omit<Intl.DateTimeFormatOptions, 'timeZone'> & {
  readonly locale?: string;
};

export const formatInstant = (
  zone: ZoneId,
  instant: InstantMs,
  options: FormatOptions = {},
): string => {
  const { locale = 'en-US', ...formatOptions } = options;

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    ...formatOptions,
    timeZone: zone,
  }).format(new Date(instant));
};
