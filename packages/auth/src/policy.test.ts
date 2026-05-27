import { describe, expect, it, vi } from 'vitest';

import type { Action } from './action.ts';
import type { Actor } from './actor.ts';
import type { Permission, Role } from './permission.ts';
import type { AuthContext, PolicyCondition, PolicyRule } from './policy.ts';
import { allow, authorize, freshSession, permission } from './policy.ts';
import type { Resource } from './resource.ts';

const actor = (
  input: {
    role?: Role;
    permissions?: readonly Permission[];
  } = {},
): Actor => ({
  id: 'actor-1',
  kind: 'human',
  displayName: 'Steven',
  role: input.role ?? 'admin',
  permissions: input.permissions ?? [],
});

const authorizeWith = (input: {
  actor?: Actor;
  action?: Action;
  resource?: Resource;
  context?: AuthContext;
  policies?: readonly PolicyRule[];
}) =>
  authorize({
    actor: input.actor ?? actor(),
    action: input.action ?? 'pricing:publish',
    resource: input.resource ?? 'pricing_catalog',
    ...(input.context === undefined ? {} : { context: input.context }),
    policies: input.policies ?? [],
  });

describe('allow policy builder', () => {
  it('builds a rule with action, resource, roles, permissions, and conditions', () => {
    const condition = freshSession({ maxAgeMinutes: 10 });

    const rule = allow('auth:login')
      .on('auth_identity')
      .to('admin')
      .require('auth:session:read')
      .when(condition);

    expect(rule.action).toBe('auth:login');
    expect(rule.resource).toBe('auth_identity');
    expect(rule.roles).toEqual(['admin']);
    expect(rule.permissions).toEqual(['auth:session:read']);
    expect(rule.conditions).toEqual([condition]);
  });

  it('keeps builder calls immutable', () => {
    const condition = freshSession({ maxAgeMinutes: 10 });
    const base = allow('auth:login');
    const scoped = base.on('auth_identity');
    const restricted = scoped.to('admin');
    const permitted = restricted.require('auth:session:read');
    const conditioned = permitted.when(condition);

    expect(base.resource).toBeUndefined();
    expect(base.roles).toEqual([]);
    expect(base.permissions).toEqual([]);
    expect(base.conditions).toEqual([]);

    expect(scoped.resource).toBe('auth_identity');
    expect(scoped.roles).toEqual([]);

    expect(restricted.roles).toEqual(['admin']);
    expect(restricted.permissions).toEqual([]);

    expect(permitted.permissions).toEqual(['auth:session:read']);
    expect(permitted.conditions).toEqual([]);

    expect(conditioned.conditions).toEqual([condition]);
  });

  it('appends conditions across multiple when calls', () => {
    const first = freshSession({ maxAgeMinutes: 10 });
    const second = permission('auth:session:read');

    const rule = allow('auth:login').when(first).when(second);

    expect(rule.conditions).toEqual([first, second]);
  });
});

describe('authorize', () => {
  it('allows a matching action, resource, role, and permission', () => {
    const allowedActor = actor({
      role: 'admin',
      permissions: ['pricing:publish'],
    });

    const decision = authorizeWith({
      actor: allowedActor,
      policies: [
        allow('pricing:publish')
          .on('pricing_catalog')
          .to('admin')
          .require('pricing:publish'),
      ],
    });

    expect(decision).toEqual({ ok: true, actor: allowedActor });
  });

  it('allows resource-less rules for any requested resource', () => {
    const customer = actor({ role: 'customer' });

    const decision = authorizeWith({
      actor: customer,
      action: 'auth:logout',
      resource: 'auth_session',
      policies: [allow('auth:logout').to('customer')],
    });

    expect(decision).toEqual({ ok: true, actor: customer });
  });

  it('requires every permission on a matching rule', () => {
    const admin = actor({
      role: 'admin',
      permissions: ['pricing:read', 'pricing:plan'],
    });

    const decision = authorizeWith({
      actor: admin,
      action: 'pricing:publish',
      policies: [
        allow('pricing:publish')
          .on('pricing_catalog')
          .to('admin')
          .require('pricing:read', 'pricing:publish'),
      ],
    });

    expect(decision).toMatchObject({
      ok: false,
      reason: 'missing_permission',
    });
  });

  it('denies when no action/resource candidate exists', () => {
    const decision = authorizeWith({
      action: 'auth:logout',
      resource: 'auth_session',
      policies: [
        allow('pricing:publish').on('pricing_catalog').to('admin'),
        allow('auth:logout').on('auth_identity').to('admin'),
      ],
    });

    expect(decision).toEqual({
      ok: false,
      reason: 'missing_permission',
      safeMessage: 'You do not have permission to perform this action.',
      details: {
        action: 'auth:logout',
        resource: 'auth_session',
        role: 'admin',
      },
    });
  });

  it('denies missing_role when candidates exist but no role matches', () => {
    const decision = authorizeWith({
      actor: actor({ role: 'customer' }),
      policies: [
        allow('pricing:publish').on('pricing_catalog').to('admin', 'owner'),
      ],
    });

    expect(decision).toMatchObject({
      ok: false,
      reason: 'missing_role',
    });
  });

  it('denies missing_permission when the role matches but permission does not', () => {
    const decision = authorizeWith({
      actor: actor({ role: 'admin', permissions: ['pricing:read'] }),
      policies: [
        allow('pricing:publish')
          .on('pricing_catalog')
          .to('admin')
          .require('pricing:publish'),
      ],
    });

    expect(decision).toMatchObject({
      ok: false,
      reason: 'missing_permission',
    });
  });

  it('keeps scanning after an earlier candidate fails role or permission checks', () => {
    const customer = actor({ role: 'customer' });

    const decision = authorizeWith({
      actor: customer,
      policies: [
        allow('pricing:publish').on('pricing_catalog').to('admin'),
        allow('pricing:publish')
          .on('pricing_catalog')
          .to('customer')
          .require('pricing:publish'),
        allow('pricing:publish').on('pricing_catalog').to('customer'),
      ],
    });

    expect(decision).toEqual({ ok: true, actor: customer });
  });

  it('denies with the first failing condition details', () => {
    const condition: PolicyCondition = {
      name: 'location_context',
      denyReason: 'missing_context',
      safeMessage: 'Choose a location before continuing.',
      evaluate: ({ context }) => context['locationId'] === 'loc_1',
    };

    const decision = authorizeWith({
      actor: actor({ role: 'admin' }),
      context: { locationId: 'loc_2' },
      policies: [
        allow('pricing:publish')
          .on('pricing_catalog')
          .to('admin')
          .when(condition),
      ],
    });

    expect(decision).toEqual({
      ok: false,
      reason: 'missing_context',
      safeMessage: 'Choose a location before continuing.',
      details: { condition: 'location_context' },
    });
  });

  it('passes actor, action, resource, and context into conditions', () => {
    const admin = actor({ role: 'admin' });
    const seen: Array<{
      actor: Actor;
      action: Action;
      resource: Resource;
      context: AuthContext;
    }> = [];

    const condition: PolicyCondition = {
      name: 'capture',
      denyReason: 'missing_context',
      safeMessage: 'Missing context.',
      evaluate: (input) => {
        seen.push(input);
        return true;
      },
    };

    authorizeWith({
      actor: admin,
      action: 'pricing:publish',
      resource: 'pricing_catalog',
      context: { requestId: 'req_1' },
      policies: [
        allow('pricing:publish').on('pricing_catalog').when(condition),
      ],
    });

    expect(seen).toEqual([
      {
        actor: admin,
        action: 'pricing:publish',
        resource: 'pricing_catalog',
        context: { requestId: 'req_1' },
      },
    ]);
  });

  it('short-circuits condition evaluation on the first failure', () => {
    const first = vi.fn(() => false);
    const second = vi.fn(() => {
      throw new Error('second condition should not run');
    });

    const decision = authorizeWith({
      policies: [
        allow('pricing:publish').on('pricing_catalog').when(
          {
            name: 'first',
            denyReason: 'missing_context',
            safeMessage: 'First failed.',
            evaluate: first,
          },
          {
            name: 'second',
            denyReason: 'missing_context',
            safeMessage: 'Second failed.',
            evaluate: second,
          },
        ),
      ],
    });

    expect(decision).toMatchObject({
      ok: false,
      reason: 'missing_context',
      details: { condition: 'first' },
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('does not evaluate conditions after role or permission mismatch', () => {
    const condition = vi.fn(() => true);
    const guardedRule = allow('pricing:publish')
      .on('pricing_catalog')
      .to('owner')
      .require('pricing:publish')
      .when({
        name: 'guard',
        denyReason: 'missing_context',
        safeMessage: 'Guard failed.',
        evaluate: condition,
      });

    authorizeWith({
      actor: actor({ role: 'customer' }),
      policies: [guardedRule],
    });
    authorizeWith({
      actor: actor({ role: 'owner', permissions: [] }),
      policies: [guardedRule],
    });

    expect(condition).not.toHaveBeenCalled();
  });

  it('stays stable with a large noisy policy list and a late matching rule', () => {
    const admin = actor({
      role: 'admin',
      permissions: ['pricing:publish'],
    });
    const noisyPolicies = Array.from({ length: 1_000 }, (_, index) =>
      allow(index % 2 === 0 ? 'pricing:read' : 'auth:logout')
        .on(`noise_resource_${index}`)
        .to(index % 2 === 0 ? 'customer' : 'driver'),
    );
    const policies = [
      ...noisyPolicies.slice(0, 777),
      allow('pricing:publish')
        .on('pricing_catalog')
        .to('admin')
        .require('pricing:publish')
        .when(freshSession({ maxAgeMinutes: 15 })),
      ...noisyPolicies.slice(777),
    ];

    for (let index = 0; index < 100; index += 1) {
      expect(
        authorizeWith({
          actor: admin,
          context: { sessionAgeMinutes: index % 16 },
          policies,
        }),
      ).toEqual({ ok: true, actor: admin });
    }
  });
});

describe('permission condition', () => {
  it('checks actor permissions and exposes denial metadata', () => {
    const condition = permission('auth:session:read');

    expect(condition.name).toBe('permission:auth:session:read');
    expect(condition.denyReason).toBe('missing_permission');
    expect(condition.safeMessage).toBe(
      'You do not have permission to perform this action.',
    );
    expect(
      condition.evaluate({
        actor: actor({ permissions: ['auth:session:read'] }),
        action: 'auth:login',
        resource: 'auth_identity',
        context: {},
      }),
    ).toBe(true);
    expect(
      condition.evaluate({
        actor: actor({ permissions: [] }),
        action: 'auth:login',
        resource: 'auth_identity',
        context: {},
      }),
    ).toBe(false);
  });
});

describe('freshSession condition', () => {
  it('allows session ages at or below the max age', () => {
    const condition = freshSession({ maxAgeMinutes: 10 });

    expect(
      condition.evaluate({
        actor: actor(),
        action: 'auth:login',
        resource: 'auth_session',
        context: { sessionAgeMinutes: 10 },
      }),
    ).toBe(true);
  });

  it('denies stale or missing session ages', () => {
    const condition = freshSession({ maxAgeMinutes: 10 });

    expect(
      condition.evaluate({
        actor: actor(),
        action: 'auth:login',
        resource: 'auth_session',
        context: { sessionAgeMinutes: 11 },
      }),
    ).toBe(false);
    expect(
      condition.evaluate({
        actor: actor(),
        action: 'auth:login',
        resource: 'auth_session',
        context: {},
      }),
    ).toBe(false);
  });
});
