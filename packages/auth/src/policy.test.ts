import { describe, expect, it, vi } from 'vitest';

import type { Action } from './action.ts';
import type { Actor } from './actor.ts';
import type { Permission, Role } from './permission.ts';
import type { AuthContext, PolicyCondition } from './policy.ts';
import { allow, authorize, freshSession } from './policy.ts';

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

describe('allow policy builder', () => {
  it('builds a rule with action, roles, permissions, and conditions', () => {
    const condition = freshSession({ maxAgeMinutes: 10 });

    const rule = allow('auth:login')
      .to('admin')
      .require('auth:session:read')
      .when(condition);

    expect(rule.action).toBe('auth:login');
    expect(rule.roles).toEqual(['admin']);
    expect(rule.permissions).toEqual(['auth:session:read']);
    expect(rule.conditions).toEqual([condition]);
  });

  it('keeps builder calls immutable', () => {
    const condition = freshSession({ maxAgeMinutes: 10 });
    const base = allow('auth:login');
    const restricted = base.to('admin');
    const permitted = restricted.require('auth:session:read');
    const conditioned = permitted.when(condition);

    expect(base.roles).toEqual([]);
    expect(base.permissions).toEqual([]);
    expect(base.conditions).toEqual([]);

    expect(restricted.roles).toEqual(['admin']);
    expect(restricted.permissions).toEqual([]);

    expect(permitted.permissions).toEqual(['auth:session:read']);
    expect(permitted.conditions).toEqual([]);

    expect(conditioned.conditions).toEqual([condition]);
  });

  it('appends conditions across multiple when calls', () => {
    const first = freshSession({ maxAgeMinutes: 10 });
    const second: PolicyCondition = {
      name: 'location_context',
      denyReason: 'missing_context',
      safeMessage: 'Choose a location before continuing.',
      evaluate: ({ context }) => context['locationId'] === 'loc_1',
    };

    const rule = allow('auth:login').when(first).when(second);

    expect(rule.conditions).toEqual([first, second]);
  });
});

describe('authorize', () => {
  it('allows a matching action, role, and permission', () => {
    const allowedActor = actor({
      role: 'admin',
      permissions: ['pricing:publish'],
    });

    const decision = authorize({
      actor: allowedActor,
      action: 'pricing:publish',
      policies: [
        allow('pricing:publish').to('admin').require('pricing:publish'),
      ],
    });

    expect(decision).toEqual({ ok: true, actor: allowedActor });
  });

  it('allows a matching action and role without required permissions', () => {
    const customer = actor({ role: 'customer' });

    const decision = authorize({
      actor: customer,
      action: 'auth:logout',
      policies: [allow('auth:logout').to('customer')],
    });

    expect(decision).toEqual({ ok: true, actor: customer });
  });

  it('requires every permission on a matching rule', () => {
    const admin = actor({
      role: 'admin',
      permissions: ['pricing:read', 'pricing:plan'],
    });

    const decision = authorize({
      actor: admin,
      action: 'pricing:publish',
      policies: [
        allow('pricing:publish')
          .to('admin')
          .require('pricing:read', 'pricing:publish'),
      ],
    });

    expect(decision).toMatchObject({
      ok: false,
      reason: 'missing_permission',
    });
  });

  it('denies when no action candidate exists', () => {
    const decision = authorize({
      actor: actor(),
      action: 'auth:logout',
      policies: [
        allow('pricing:publish').to('admin'),
        allow('auth:login').to('admin'),
      ],
    });

    expect(decision).toEqual({
      ok: false,
      reason: 'missing_permission',
      safeMessage: 'You do not have permission to perform this action.',
      details: {
        action: 'auth:logout',
        role: 'admin',
      },
    });
  });

  it('denies missing_role when candidates exist but no role matches', () => {
    const decision = authorize({
      actor: actor({ role: 'customer' }),
      action: 'pricing:publish',
      policies: [allow('pricing:publish').to('admin', 'owner')],
    });

    expect(decision).toMatchObject({
      ok: false,
      reason: 'missing_role',
    });
  });

  it('denies missing_permission when the role matches but permission does not', () => {
    const decision = authorize({
      actor: actor({ role: 'admin', permissions: ['pricing:read'] }),
      action: 'pricing:publish',
      policies: [
        allow('pricing:publish').to('admin').require('pricing:publish'),
      ],
    });

    expect(decision).toMatchObject({
      ok: false,
      reason: 'missing_permission',
    });
  });

  it('keeps scanning after an earlier candidate fails role or permission checks', () => {
    const customer = actor({ role: 'customer' });

    const decision = authorize({
      actor: customer,
      action: 'pricing:publish',
      policies: [
        allow('pricing:publish').to('admin'),
        allow('pricing:publish').to('customer').require('pricing:publish'),
        allow('pricing:publish').to('customer'),
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

    const decision = authorize({
      actor: actor({ role: 'admin' }),
      action: 'pricing:publish',
      context: { locationId: 'loc_2' },
      policies: [allow('pricing:publish').to('admin').when(condition)],
    });

    expect(decision).toEqual({
      ok: false,
      reason: 'missing_context',
      safeMessage: 'Choose a location before continuing.',
      details: { condition: 'location_context' },
    });
  });

  it('passes actor, action, and context into conditions', () => {
    const admin = actor({ role: 'admin' });
    const seen: Array<{
      actor: Actor;
      action: Action;
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

    authorize({
      actor: admin,
      action: 'pricing:publish',
      context: { requestId: 'req_1' },
      policies: [allow('pricing:publish').when(condition)],
    });

    expect(seen).toEqual([
      {
        actor: admin,
        action: 'pricing:publish',
        context: { requestId: 'req_1' },
      },
    ]);
  });

  it('short-circuits condition evaluation on the first failure', () => {
    const first = vi.fn(() => false);
    const second = vi.fn(() => {
      throw new Error('second condition should not run');
    });

    const decision = authorize({
      actor: actor(),
      action: 'pricing:publish',
      policies: [
        allow('pricing:publish').when(
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
      .to('owner')
      .require('pricing:publish')
      .when({
        name: 'guard',
        denyReason: 'missing_context',
        safeMessage: 'Guard failed.',
        evaluate: condition,
      });

    authorize({
      actor: actor({ role: 'customer' }),
      action: 'pricing:publish',
      policies: [guardedRule],
    });
    authorize({
      actor: actor({ role: 'owner', permissions: [] }),
      action: 'pricing:publish',
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
      allow(index % 2 === 0 ? 'pricing:read' : 'auth:logout').to(
        index % 2 === 0 ? 'customer' : 'driver',
      ),
    );
    const policies = [
      ...noisyPolicies.slice(0, 777),
      allow('pricing:publish')
        .to('admin')
        .require('pricing:publish')
        .when(freshSession({ maxAgeMinutes: 15 })),
      ...noisyPolicies.slice(777),
    ];

    for (let index = 0; index < 100; index += 1) {
      expect(
        authorize({
          actor: admin,
          action: 'pricing:publish',
          context: { sessionAgeMinutes: index % 16 },
          policies,
        }),
      ).toEqual({ ok: true, actor: admin });
    }
  });
});

describe('freshSession condition', () => {
  it('allows session ages at or below the max age', () => {
    const condition = freshSession({ maxAgeMinutes: 10 });

    expect(
      condition.evaluate({
        actor: actor(),
        action: 'auth:login',
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
        context: { sessionAgeMinutes: 11 },
      }),
    ).toBe(false);
    expect(
      condition.evaluate({
        actor: actor(),
        action: 'auth:login',
        context: {},
      }),
    ).toBe(false);
  });
});
