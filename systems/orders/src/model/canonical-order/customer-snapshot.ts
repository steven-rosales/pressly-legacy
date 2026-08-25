import type { CustomerReferenceV1 } from '@pressly/customers-system/capabilities/customer-reference-v1';

export type OrderCustomerSnapshot = Readonly<{
  customerId: string;
  customerVersion: number;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  phone: string | null;
  email: string | null;
}>;

export const orderCustomerSnapshotFromReference = (
  reference: CustomerReferenceV1,
): OrderCustomerSnapshot => ({
  customerId: reference.customerId,
  customerVersion: reference.version,
  firstName: reference.profile.firstName,
  lastName: reference.profile.lastName,
  businessName: reference.profile.businessName,
  phone: reference.profile.phone,
  email: reference.profile.email,
});
