import type { CustomerPrincipal } from './schemas.ts';

export const projectCustomerPrincipal = (
  principal: Readonly<{
    identityId: string;
    displayName: string;
    email?: string;
    audience?: 'customer';
    customerId?: string;
  }>,
): CustomerPrincipal | null => {
  if (principal.audience !== 'customer' || principal.customerId === undefined)
    return null;
  return {
    identityId: principal.identityId,
    customerId: principal.customerId,
    audience: 'customer',
    displayName: principal.displayName,
    ...(principal.email === undefined ? {} : { email: principal.email }),
  };
};
