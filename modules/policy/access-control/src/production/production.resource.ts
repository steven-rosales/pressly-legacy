import {
  businessScope,
  globalScope,
  locationScope,
  type AuthResource,
} from '@pressly/auth/authorization';

export type ProductionLocationResource = Omit<
  AuthResource,
  'kind' | 'attributes'
> &
  Readonly<{
    kind: 'production.location';
    attributes: Readonly<{ locationId: string; businessId: string }>;
  }>;

export type ProductionOperationsResource = Omit<
  AuthResource,
  'kind' | 'attributes'
> &
  Readonly<{
    kind: 'production.operations';
    attributes: Readonly<Record<string, never>>;
  }>;

export type ProductionResource =
  | ProductionLocationResource
  | ProductionOperationsResource;

export const productionLocationResource = (
  locationId: string,
  businessId: string,
): ProductionLocationResource => ({
  kind: 'production.location',
  id: `production:${locationId}`,
  scope: locationScope(locationId),
  ancestorScopes: [businessScope(businessId)],
  attributes: { locationId, businessId },
});

export const productionOperationsResource =
  (): ProductionOperationsResource => ({
    kind: 'production.operations',
    id: 'production:operations',
    scope: globalScope(),
    attributes: {},
  });
