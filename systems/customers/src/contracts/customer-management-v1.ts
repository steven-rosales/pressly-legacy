import type { CustomersSystem } from '../system.ts';

export type CustomerManagementOperations = Pick<
  CustomersSystem['cells'],
  'createCustomer' | 'getCustomer' | 'listCustomers' | 'updateCustomer'
>;
