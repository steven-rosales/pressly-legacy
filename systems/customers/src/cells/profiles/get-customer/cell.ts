import { defineOperation } from '@pressly/cells';
import type { CustomerSummary } from '../../../model/customer.ts';
import { getCustomerContract } from './contract.ts';
import { makeExecuteGetCustomer } from './execute.ts';
import {
  getCustomerOperationId,
  type GetCustomerExpectedFailure,
  type GetCustomerQuery,
  type GetCustomerRepository,
} from './types.ts';

export const getCustomerCellDeclaration = defineOperation<
  GetCustomerQuery,
  CustomerSummary,
  GetCustomerExpectedFailure
>({
  kind: 'query',
  id: getCustomerOperationId,
  authentication: 'none',
  contract: getCustomerContract,
  surfaces: [],
  observability: { operation: 'customers.get_customer' },
});

export const makeGetCustomerCell = (repository: GetCustomerRepository) =>
  defineOperation(
    getCustomerCellDeclaration,
    makeExecuteGetCustomer(repository),
  );
