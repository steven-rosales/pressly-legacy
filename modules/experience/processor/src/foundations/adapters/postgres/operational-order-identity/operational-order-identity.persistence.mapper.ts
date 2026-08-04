import { invariantViolationError } from '@pressly/errors/factories';
import type { CanonicalOrderContext } from '../../../language/operational-order/operational-order.model.ts';

const unexpectedValue = (field: string, value: string): never => {
  throw invariantViolationError({
    code: 'processor_operational_order_invalid_persistence_value',
    message: `Unexpected ${field} value in Processor order projection: ${value}.`,
  });
};

export const customerResolutionFromPersistence = (
  value: string,
): CanonicalOrderContext['customer']['resolution'] => {
  switch (value) {
    case 'resolved':
    case 'not_provided':
    case 'pending':
    case 'conflict':
    case 'legacy_unknown':
      return value;
    default:
      return unexpectedValue('customer resolution', value);
  }
};

export const commercialStateFromPersistence = (
  value: string,
): CanonicalOrderContext['commercialState'] => {
  switch (value) {
    case 'open':
    case 'completed':
    case 'canceled':
      return value;
    default:
      return unexpectedValue('commercial state', value);
  }
};

export const admissionStateFromPersistence = (
  value: string,
): CanonicalOrderContext['admissionState'] => {
  switch (value) {
    case 'unreleased':
    case 'released':
    case 'withdrawn':
      return value;
    default:
      return unexpectedValue('admission state', value);
  }
};
