import { makeAccessIdentitySchema } from './identity.ts';
import type { AccessIdentitySchema } from './identity.ts';
import { makeAccessScopeSchema } from './scope.ts';
import type { AccessScopeSchema } from './scope.ts';

export type AccessSchema = AccessIdentitySchema & AccessScopeSchema;

export const makeAccessSchema = (): AccessSchema => {
  const scope = makeAccessScopeSchema();
  const identity = makeAccessIdentitySchema({
    businessAccountId: scope.businessAccounts.id,
    productionLocationId: scope.accessProductionLocations.id,
    productionLocationBusinessId: scope.accessProductionLocations.businessId,
  });
  return Object.freeze({ ...scope, ...identity });
};
