import { isCommandContextValid } from '@pressly/cells/command-context';
import type {
  CreateCustomerCommand,
  CreateCustomerExpectedFailure,
} from './types.ts';

export const validateCreateCustomer = (
  command: CreateCustomerCommand,
): CreateCustomerExpectedFailure | null =>
  command.businessId.trim() === '' ||
  command.idempotencyKey.trim() === '' ||
  !isCommandContextValid(command.context)
    ? { kind: 'validation', code: 'user_idempotency_key_required' }
    : null;
