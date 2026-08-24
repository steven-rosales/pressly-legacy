export type CustomerProfile = Readonly<{
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  phone: string | null;
  email: string | null;
}>;

export type CustomerProfileField = keyof CustomerProfile;

export type Customer = CustomerProfile &
  Readonly<{
    id: string;
    businessId: string;
    version: number;
    active: boolean;
  }>;

export type CustomerSummary = Customer &
  Readonly<{
    displayName: string;
    possibleDuplicateCount: number;
    createdAt: Date;
    updatedAt: Date;
  }>;

export type CustomerCommandResult = Readonly<{
  userId: string;
  version: number;
  replayed: boolean;
}>;

export type StoredCustomerCommandReceipt = Readonly<{
  commandHash: string;
  result: CustomerCommandResult;
}>;

export const customerProfileFields = Object.freeze([
  'firstName',
  'lastName',
  'businessName',
  'phone',
  'email',
] as const satisfies readonly CustomerProfileField[]);

export const projectCustomerProfile = (
  customer: Pick<Customer, CustomerProfileField>,
): CustomerProfile => ({
  firstName: customer.firstName,
  lastName: customer.lastName,
  businessName: customer.businessName,
  phone: customer.phone,
  email: customer.email,
});

const customerDisplayName = (
  customer: Customer & Readonly<{ createdAt: Date; updatedAt: Date }>,
): string => {
  const business = customer.businessName?.trim();
  if (business !== undefined && business !== '') return business;

  const person = [customer.firstName, customer.lastName]
    .filter((part): part is string => part !== null && part.trim() !== '')
    .map((part) => part.trim())
    .join(' ');

  return person === '' ? 'Unnamed customer' : person;
};

export const projectCustomerSummary = (
  customer: Customer & Readonly<{ createdAt: Date; updatedAt: Date }>,
  possibleDuplicateCount: number,
): CustomerSummary => ({
  ...customer,
  displayName: customerDisplayName(customer),
  possibleDuplicateCount,
});
