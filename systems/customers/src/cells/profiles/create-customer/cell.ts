import { bindCell, declareCommandCell } from '@pressly/cells';
import type { CustomerCommandResult } from '../../../model/customer.ts';
import { createCustomerContract } from './contract.ts';
import {
  createCustomerCommandHash,
  makeExecuteCreateCustomer,
  type CreateCustomerDependencies,
} from './execute.ts';
import {
  createCustomerOperationId,
  type CreateCustomerCommand,
  type CreateCustomerExpectedFailure,
} from './types.ts';

export const createCustomerCellDeclaration = declareCommandCell<
  CreateCustomerCommand,
  CustomerCommandResult,
  CreateCustomerExpectedFailure
>({
  id: createCustomerOperationId,
  authentication: 'none',
  contract: createCustomerContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => input.idempotencyKey,
  },
  idempotency: {
    required: true,
    key: (input) => input.idempotencyKey,
    fingerprint: createCustomerCommandHash,
  },
  surfaces: [],
  emits: [],
  consumes: [],
  observability: { operation: 'customers.create_customer' },
});

export const makeCreateCustomerCell = (
  dependencies: CreateCustomerDependencies,
) =>
  bindCell(
    createCustomerCellDeclaration,
    makeExecuteCreateCustomer(dependencies),
  );
