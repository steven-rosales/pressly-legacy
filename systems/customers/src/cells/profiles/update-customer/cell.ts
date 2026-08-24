import { bindCell, declareCommandCell } from '@pressly/cells';
import type { CustomerCommandResult } from '../../../model/customer.ts';
import { updateCustomerContract } from './contract.ts';
import {
  makeExecuteUpdateCustomer,
  updateCustomerCommandHash,
  type UpdateCustomerDependencies,
} from './execute.ts';
import {
  updateCustomerOperationId,
  type UpdateCustomerCommand,
  type UpdateCustomerExpectedFailure,
} from './types.ts';

export const updateCustomerCellDeclaration = declareCommandCell<
  UpdateCustomerCommand,
  CustomerCommandResult,
  UpdateCustomerExpectedFailure
>({
  id: updateCustomerOperationId,
  authentication: 'none',
  contract: updateCustomerContract,
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: {
    required: true,
    key: (input) => input.idempotencyKey,
    fingerprint: updateCustomerCommandHash,
  },
  surfaces: [],
  emits: [],
  consumes: [],
  observability: { operation: 'customers.update_customer' },
});

export const makeUpdateCustomerCell = (
  dependencies: UpdateCustomerDependencies,
) =>
  bindCell(
    updateCustomerCellDeclaration,
    makeExecuteUpdateCustomer(dependencies),
  );
