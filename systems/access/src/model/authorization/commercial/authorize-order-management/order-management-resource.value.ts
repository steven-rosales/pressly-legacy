import {
  businessScope,
  locationScope,
  type AuthResource,
} from '../../public.ts';

export type OrderManagementLocationResource = Omit<
  AuthResource,
  'kind' | 'attributes'
> &
  Readonly<{
    kind: 'order-management.location';
    attributes: Readonly<{ locationId: string; businessId: string }>;
  }>;

export const orderManagementLocationResource = (
  locationId: string,
  businessId: string,
): OrderManagementLocationResource => ({
  kind: 'order-management.location',
  id: `order-management:${locationId}`,
  scope: locationScope(locationId),
  ancestorScopes: [businessScope(businessId)],
  attributes: { locationId, businessId },
});
