import { result, type Result } from '@pressly/kernel';
import type { ControlAccess } from '../control-access/control-access.model.ts';
import type { ControlDirectCustomerInput } from './control-order.value.ts';
import type { ControlOrderCustomerReference } from './control-order.value.ts';
import {
  controlLocationNotFound,
  type ControlLocationFailure,
} from './control-order.failure.ts';

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

export const toControlOrderCustomerReference = (
  customer: ControlDirectCustomerInput,
): ControlOrderCustomerReference =>
  customer.resolution === 'resolved'
    ? {
        resolution: 'resolved',
        userId: customer.userId,
        externalUserId: null,
      }
    : {
        resolution: 'not_provided',
        userId: null,
        externalUserId: null,
      };
