import type { CustomerReferenceV1 } from '../contracts/customer-reference-v1.ts';
import type { Customer } from './customer.ts';

export const projectCustomerReferenceV1 = (
  customer: Customer,
): CustomerReferenceV1 => ({
  customerId: customer.id,
  businessId: customer.businessId,
  version: customer.version,
  active: customer.active,
  profile: {
    firstName: customer.firstName,
    lastName: customer.lastName,
    businessName: customer.businessName,
    phone: customer.phone,
    email: customer.email,
  },
});
