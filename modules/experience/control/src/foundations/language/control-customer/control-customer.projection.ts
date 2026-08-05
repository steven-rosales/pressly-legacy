import type {
  ControlCustomer,
  ControlCustomerSnapshot,
} from './control-customer.model.ts';

export const toControlCustomer = (
  customer: ControlCustomerSnapshot,
): ControlCustomer => ({
  id: customer.id,
  version: customer.version,
  active: customer.active,
  firstName: customer.firstName,
  lastName: customer.lastName,
  businessName: customer.businessName,
  phone: customer.phone,
  email: customer.email,
  displayName: customer.displayName,
  possibleDuplicateCount: customer.possibleDuplicateCount,
  createdAt: customer.createdAt.toISOString(),
  updatedAt: customer.updatedAt.toISOString(),
});
