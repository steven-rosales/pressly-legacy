import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import {
  formatInstant as formatInstantInZone,
  instantFromUtcIso,
  instantFromWall,
  toUtcIso,
  wallFromInstant,
  type FormatOptions,
} from './convert.ts';
import type {
  InstantMs,
  NormalizedWallDateTime,
  TimeError,
  UtcIso,
  WallDateTime,
  WallDisambiguation,
} from './types.ts';

export const UTC = 'UTC' as const;
export const NEW_YORK = 'America/New_York' as const;

export const utcIsoToNewYorkWall = (
  utcIso: string,
): Result<NormalizedWallDateTime, TimeError> => {
  const instant = instantFromUtcIso(utcIso);

  if (result.isErr(instant)) return instant;

  return result.ok(wallFromInstant(NEW_YORK, instant.value));
};

export const newYorkWallToInstant = (
  wall: WallDateTime,
  disambiguation: WallDisambiguation = 'reject',
): Result<InstantMs, TimeError> =>
  instantFromWall(NEW_YORK, wall, disambiguation);

export const newYorkWallToUtcIso = (
  wall: WallDateTime,
  disambiguation: WallDisambiguation = 'reject',
): Result<UtcIso, TimeError> => {
  const instant = newYorkWallToInstant(wall, disambiguation);

  if (result.isErr(instant)) return instant;

  return result.ok(toUtcIso(instant.value));
};

export const formatUtcIsoInNewYork = (
  utcIso: string,
  options?: FormatOptions,
): Result<string, TimeError> => {
  const instant = instantFromUtcIso(utcIso);

  if (result.isErr(instant)) return instant;

  return result.ok(formatInstantInZone(NEW_YORK, instant.value, options));
};

export const formatInstantInUtc = (instant: InstantMs): UtcIso =>
  toUtcIso(instant);
