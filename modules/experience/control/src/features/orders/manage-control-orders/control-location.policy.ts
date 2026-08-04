import { result, type Result } from '@pressly/kernel';
import type { ControlAccess } from '../../../foundations/language/control-access/control-access.model.ts';
import {
  controlLocationNotFound,
  type ControlLocationFailure,
} from './control-location.failure.ts';

export const resolveControlLocationIds = (
  access: ControlAccess,
  requestedLocationId?: string,
): Result<readonly string[], ControlLocationFailure> => {
  const allowed = access.locations.map((location) => location.id);
  if (requestedLocationId === undefined) return result.ok(allowed);
  return allowed.includes(requestedLocationId)
    ? result.ok([requestedLocationId])
    : result.err(controlLocationNotFound(requestedLocationId));
};
