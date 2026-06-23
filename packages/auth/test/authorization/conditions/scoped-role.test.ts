import { describe, expect, it } from 'vitest';

import {
  globalScope,
  hasScopedRole,
  locationScope,
  resourceScope,
  type AuthResource,
  type PrincipalAttributes,
} from '../../../src/authorization/index.ts';
import type { Principal } from '../../../src/authentication/index.ts';

const now = new Date('2026-06-21T12:00:00.000Z');

const principal: Principal = {
  identityId: 'identity_1',
  kind: 'human',
  displayName: 'Steven',
};

const attributes = (
  assignments: PrincipalAttributes['assignments'],
): PrincipalAttributes => ({
  assignments,
  identityActive: true,
});

const resource = (scope: AuthResource['scope']): AuthResource => ({
  kind: 'pricing.catalog',
  scope,
});

const canPublish = hasScopedRole(['owner']);

const evaluate = (
  principalAttributes: PrincipalAttributes,
  authResource: AuthResource,
): boolean =>
  canPublish.evaluate({
    principal,
    principalAttributes,
    action: 'pricing:publish',
    resource: authResource,
    environment: { now },
  });

describe('hasScopedRole', () => {
  it('allows global assignments to cover any resource scope', () => {
    expect(
      evaluate(
        attributes([{ role: 'owner', scope: globalScope() }]),
        resource(locationScope('hoboken')),
      ),
    ).toBe(true);
  });

  it('allows location assignments to cover the same location', () => {
    expect(
      evaluate(
        attributes([{ role: 'owner', scope: locationScope('hoboken') }]),
        resource(locationScope('hoboken')),
      ),
    ).toBe(true);
  });

  it('denies location assignments for another location', () => {
    expect(
      evaluate(
        attributes([{ role: 'owner', scope: locationScope('hoboken') }]),
        resource(locationScope('jersey-city')),
      ),
    ).toBe(false);
  });

  it('allows resource assignments for the same resource type and id', () => {
    expect(
      evaluate(
        attributes([
          { role: 'owner', scope: resourceScope('pricing.catalog', 'cat_1') },
        ]),
        resource(resourceScope('pricing.catalog', 'cat_1')),
      ),
    ).toBe(true);
  });

  it('denies resource assignments for another resource type or id', () => {
    expect(
      evaluate(
        attributes([
          { role: 'owner', scope: resourceScope('pricing.catalog', 'cat_1') },
        ]),
        resource(resourceScope('pricing.catalog', 'cat_2')),
      ),
    ).toBe(false);
    expect(
      evaluate(
        attributes([
          { role: 'owner', scope: resourceScope('pricing.catalog', 'cat_1') },
        ]),
        resource(resourceScope('order', 'cat_1')),
      ),
    ).toBe(false);
  });

  it('denies inactive assignments', () => {
    expect(
      evaluate(
        attributes([
          {
            role: 'owner',
            scope: globalScope(),
            startsAt: new Date('2026-06-22T12:00:00.000Z'),
          },
        ]),
        resource(locationScope('hoboken')),
      ),
    ).toBe(false);
    expect(
      evaluate(
        attributes([
          {
            role: 'owner',
            scope: globalScope(),
            endsAt: now,
          },
        ]),
        resource(locationScope('hoboken')),
      ),
    ).toBe(false);
  });

  it('denies assignments with a different role', () => {
    expect(
      evaluate(
        attributes([{ role: 'admin', scope: globalScope() }]),
        resource(locationScope('hoboken')),
      ),
    ).toBe(false);
  });
});
