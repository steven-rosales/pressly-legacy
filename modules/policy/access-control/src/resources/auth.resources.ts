import { globalScope, type AuthResource } from '@pressly/auth/authorization';
import type { Request } from 'express';

export type AuthIdentityResource = Omit<
  AuthResource,
  'kind' | 'id' | 'attributes'
> &
  Readonly<{
    kind: 'auth.identity';
    id: string;
    attributes: Readonly<Record<string, never>>;
  }>;

export const authIdentityResourceFromRequest = (
  req: Request,
): AuthIdentityResource => {
  const identityId = req.params['identityId'];

  return {
    kind: 'auth.identity',
    id: Array.isArray(identityId) ? (identityId[0] ?? '') : (identityId ?? ''),
    scope: globalScope(),
    attributes: {},
  };
};
