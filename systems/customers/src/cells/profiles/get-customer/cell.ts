import { bindCell, declareQueryCell } from '@pressly/cells';
import type { CustomerSummary } from '../../../model/customer.ts';
import { getCustomerContract } from './contract.ts';
import { makeExecuteGetCustomer } from './execute.ts';
import {
  getCustomerOperationId,
  type GetCustomerExpectedFailure,
  type GetCustomerQuery,
  type GetCustomerRepository,
} from './types.ts';

export const getCustomerCellDeclaration = declareQueryCell<
  GetCustomerQuery,
  CustomerSummary,
  GetCustomerExpectedFailure
>({
  id: getCustomerOperationId,
  authentication: 'none',
  contract: getCustomerContract,
  surfaces: [],
  observability: { operation: 'customers.get_customer' },
});

export const makeGetCustomerCell = (repository: GetCustomerRepository) =>
  bindCell(getCustomerCellDeclaration, makeExecuteGetCustomer(repository));
