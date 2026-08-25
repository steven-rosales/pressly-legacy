import { describe, expect, it } from 'vitest';

import {
  freshSession,
  globalScope,
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

const resource: AuthResource = {
  kind: 'auth.session',
  scope: globalScope(),
};

describe('freshSession', () => {
  it('passes when session age is inside the maximum', () => {
    expect(
      freshSession(15).evaluate({
        principal,
        principalAttributes,
        action: 'auth:session:revoke',
        resource,
        environment: {
          now: new Date('2026-06-21T12:00:00.000Z'),
          sessionAgeMinutes: 15,
        },
      }),
    ).toBe(true);
  });

  it('fails when session age is missing or stale', () => {
    const condition = freshSession(15);
    const input = {
      principal,
      principalAttributes,
      action: 'auth:session:revoke' as const,
      resource,
      environment: { now: new Date('2026-06-21T12:00:00.000Z') },
    };

    expect(condition.evaluate(input)).toBe(false);
    expect(
      condition.evaluate({
        ...input,
        environment: { ...input.environment, sessionAgeMinutes: 16 },
      }),
    ).toBe(false);
  });
});
