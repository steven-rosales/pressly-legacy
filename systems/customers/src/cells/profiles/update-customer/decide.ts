import { isCommandContextValid } from '@pressly/cells/command-context';
import {
  customerProfileFields,
  type Customer,
  type CustomerProfileField,
} from '../../../model/customer.ts';
import type {
  UpdateCustomerCommand,
  UpdateCustomerExpectedFailure,
} from './types.ts';

export type UpdateCustomerDecision =
  | Readonly<{
      kind: 'commit';
      nextVersion: number;
      authorityFields: readonly CustomerProfileField[];
    }>
  | Readonly<{
      kind: 'reject';
      failure: UpdateCustomerExpectedFailure;
    }>;

export const validateUpdateCustomer = (
  command: UpdateCustomerCommand,
): UpdateCustomerExpectedFailure | null =>
  command.businessId.trim() === '' ||
  command.idempotencyKey.trim() === '' ||
  !isCommandContextValid(command.context) ||
  command.userId.trim() === '' ||
  command.expectedVersion < 1 ||
  Object.keys(command.changes).length === 0
    ? { kind: 'validation', code: 'user_update_invalid' }
    : null;

export const decideUpdateCustomer = (
  current: Customer | null,
  command: UpdateCustomerCommand,
): UpdateCustomerDecision => {
  if (current === null)
    return {
      kind: 'reject',
      failure: { kind: 'not_found', code: 'user_not_found' },
    };
  if (current.version !== command.expectedVersion)
    return {
      kind: 'reject',
      failure: { kind: 'conflict', code: 'user_version_conflict' },
    };

  return {
    kind: 'commit',
    nextVersion: current.version + 1,
    authorityFields: customerProfileFields.filter(
      (field) => field in command.changes,
    ),
  };
};
