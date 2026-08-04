import { globalScope, type AuthResource } from '@pressly/auth/authorization';

export type AuthIdentityResource = Omit<
  AuthResource,
  'kind' | 'id' | 'attributes'
> &
  Readonly<{
    kind: 'auth.identity';
    id: string;
    attributes: Readonly<Record<string, never>>;
  }>;

export const authIdentityResource = (
  identityId: string,
): AuthIdentityResource => ({
  kind: 'auth.identity',
  id: identityId,
  scope: globalScope(),
  attributes: {},
});
