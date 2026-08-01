import {
  businessScope,
  globalScope,
  locationScope,
  type AuthResource,
} from '@pressly/auth/authorization';

export type OrderManagementUsersResource = Omit<
  AuthResource,
  'kind' | 'attributes'
> &
  Readonly<{
    kind: 'order-management.users';
    attributes: Readonly<Record<string, never>>;
  }>;

export type OrderManagementLocationResource = Omit<
  AuthResource,
  'kind' | 'attributes'
> &
  Readonly<{
    kind: 'order-management.location';
    attributes: Readonly<{ locationId: string; businessId: string }>;
  }>;

export type OrderManagementResource =
  | OrderManagementUsersResource
  | OrderManagementLocationResource;

export const orderManagementUsersResource =
  (): OrderManagementUsersResource => ({
    kind: 'order-management.users',
    id: 'order-management:users',
    scope: globalScope(),
    attributes: {},
  });

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
