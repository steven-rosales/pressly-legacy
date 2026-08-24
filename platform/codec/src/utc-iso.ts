import { z } from 'zod';

const utcIsoPattern =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<millisecond>\d{1,3}))?Z$/;

const isUtcIsoString = (value: string): boolean => {
  const match = utcIsoPattern.exec(value);
  if (match?.groups === undefined) return false;

  const year = Number(match.groups['year']);
  const month = Number(match.groups['month']);
  const day = Number(match.groups['day']);
  const hour = Number(match.groups['hour']);
  const minute = Number(match.groups['minute']);
  const second = Number(match.groups['second']);
  const millisecond = Number(
    (match.groups['millisecond'] ?? '0').padEnd(3, '0'),
  );
  const instant = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, millisecond),
  );

  return (
    instant.getUTCFullYear() === year &&
    instant.getUTCMonth() + 1 === month &&
    instant.getUTCDate() === day &&
    instant.getUTCHours() === hour &&
    instant.getUTCMinutes() === minute &&
    instant.getUTCSeconds() === second &&
    instant.getUTCMilliseconds() === millisecond
  );
};

export const utcIsoStringSchema = z
  .string()
  .refine(isUtcIsoString, 'Expected a UTC ISO datetime.');

export type UtcIsoString = z.infer<typeof utcIsoStringSchema>;
