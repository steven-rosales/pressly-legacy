import { bindCell, declareQueryCell } from '@pressly/cells';
import { listCustomersContract } from './contract.ts';
import { makeExecuteListCustomers } from './execute.ts';
import {
  listCustomersOperationId,
  type ListCustomersExpectedFailure,
  type ListCustomersQuery,
  type ListCustomersRepository,
  type ListCustomersResult,
} from './types.ts';

export const listCustomersCellDeclaration = declareQueryCell<
  ListCustomersQuery,
  ListCustomersResult,
  ListCustomersExpectedFailure
>({
  id: listCustomersOperationId,
  authentication: 'none',
  contract: listCustomersContract,
  surfaces: [],
  observability: { operation: 'customers.list_customers' },
});

export const makeListCustomersCell = (repository: ListCustomersRepository) =>
  bindCell(listCustomersCellDeclaration, makeExecuteListCustomers(repository));
