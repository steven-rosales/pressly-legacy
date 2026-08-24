import { describe, expect, it } from 'vitest';

import {
  globalScope,
  sameIdentity,
  type AuthResource,
  type PrincipalAttributes,
} from '../public.ts';
import type { Principal } from '../../authentication/public.ts';

const principal: Principal = {
  identityId: 'identity_1',
  kind: 'human',
  displayName: 'Steven',
};

const principalAttributes: PrincipalAttributes = {
  assignments: [],
  identityActive: true,
};

const resource = (id: string): AuthResource & Readonly<{ id: string }> => ({
  kind: 'auth.identity',
  id,
  scope: globalScope(),
});

describe('sameIdentity', () => {
  it('passes when the resource id is the principal identity id', () => {
    expect(
      sameIdentity().evaluate({
        principal,
        principalAttributes,
        action: 'auth:session:read',
        resource: resource('identity_1'),
        environment: { now: new Date('2026-06-21T12:00:00.000Z') },
      }),
    ).toBe(true);
  });

  it('fails when the resource id belongs to another identity', () => {
    expect(
      sameIdentity().evaluate({
        principal,
        principalAttributes,
        action: 'auth:session:read',
        resource: resource('identity_2'),
        environment: { now: new Date('2026-06-21T12:00:00.000Z') },
      }),
    ).toBe(false);
  });
});
