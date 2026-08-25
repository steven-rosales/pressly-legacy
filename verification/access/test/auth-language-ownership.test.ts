import {
  normalizeEmail,
  principalLabel,
  type Identity,
  type Principal,
  type Session,
} from '@pressly/access-system/authentication';
import {
  allow,
  authorize,
  globalScope,
  isRole,
  scopeKey,
  type Action,
  type AuthResource,
  type PolicyRule,
  type PrincipalAttributes,
} from '@pressly/access-system/authorization';
import { describe, expect, it } from 'vitest';

describe('Access auth-language ownership', () => {
  it('exposes authentication language directly from Access', () => {
    const email = normalizeEmail(' Owner@Example.COM ');
    const identity: Identity = {
      id: 'identity-1',
      kind: 'human',
      displayName: 'Pressly Owner',
      email,
      isActive: true,
    };
    const principal: Principal = {
      identityId: identity.id,
      kind: identity.kind,
      displayName: identity.displayName,
      email,
    };
    const session: Session = {
      id: 'session-1',
      identityId: identity.id,
      issuedAt: new Date('2026-08-23T12:00:00.000Z'),
      expiresAt: new Date('2026-08-23T13:00:00.000Z'),
      lastUsedAt: new Date('2026-08-23T12:00:00.000Z'),
    };

    expect(principalLabel(principal)).toBe('owner@example.com');
    expect(session.identityId).toBe(identity.id);
  });

  it('exposes authorization language directly from Access', () => {
    const action: Action = 'production:read';
    const resource: AuthResource = {
      kind: 'production.location',
      scope: globalScope(),
    };
    const principal: Principal = {
      identityId: 'identity-1',
      kind: 'human',
      displayName: 'Pressly Owner',
    };
    const principalAttributes: PrincipalAttributes = {
      assignments: [],
      identityActive: true,
    };
    const policy: PolicyRule = allow({
      id: 'production.read.owner-surface',
      action,
      when: [],
    });

    expect(isRole('owner')).toBe(true);
    expect(scopeKey(resource.scope)).toBe('global:*');
    expect(
      authorize({
        principal,
        principalAttributes,
        action,
        resource,
        environment: { now: new Date('2026-08-23T12:00:00.000Z') },
        policies: [policy],
      }),
    ).toEqual({ tag: 'allowed', policyId: policy.id });
  });
});
