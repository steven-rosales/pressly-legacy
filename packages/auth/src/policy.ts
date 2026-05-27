import type { Actor } from './actor.ts';
import type { Action } from './action.ts';
import type { Resource } from './resource.ts';
import type { AuthDecision, AuthDenyReason } from './decision.ts';
import { allowDecision, denyDecision } from './decision.ts';
import type { Permission, Role } from './permission.ts';
import { can } from './assert-can.ts';

export type AuthContext = Readonly<{
  sessionAgeMinutes?: number;
  [key: string]: unknown;
}>;

export type PolicyCondition = Readonly<{
  name: string;
  denyReason: AuthDenyReason;
  safeMessage: string;
  evaluate: (input: {
    actor: Actor;
    action: Action;
    resource: Resource;
    context: AuthContext;
  }) => boolean;
}>;

export type PolicyRule = Readonly<{
  action: Action;
  resource?: Resource;
  roles: readonly Role[];
  permissions: readonly Permission[];
  conditions: readonly PolicyCondition[];
}>;

export type PolicyBuilder = PolicyRule &
  Readonly<{
    on: (resource: Resource) => PolicyBuilder;
    to: (...roles: readonly Role[]) => PolicyBuilder;
    require: (...permissions: readonly Permission[]) => PolicyBuilder;
    when: (...conditions: readonly PolicyCondition[]) => PolicyBuilder;
  }>;

const buildRule = (draft: PolicyRule): PolicyBuilder => ({
  ...draft,
  on: (resource) => buildRule({ ...draft, resource }),
  to: (...roles) => buildRule({ ...draft, roles }),
  require: (...permissions) => buildRule({ ...draft, permissions }),
  when: (...conditions) =>
    buildRule({ ...draft, conditions: [...draft.conditions, ...conditions] }),
});

export const allow = (action: Action): PolicyBuilder =>
  buildRule({ action, roles: [], permissions: [], conditions: [] });

export const permission = (value: Permission): PolicyCondition => ({
  name: `permission:${value}`,
  denyReason: 'missing_permission',
  safeMessage: 'You do not have permission to perform this action.',
  evaluate: ({ actor }) => can(actor, value),
});

export const freshSession = (input: {
  maxAgeMinutes: number;
}): PolicyCondition => ({
  name: 'fresh_session',
  denyReason: 'stale_session',
  safeMessage: 'Please log in again before performing this action.',
  evaluate: ({ context }) =>
    typeof context.sessionAgeMinutes === 'number' &&
    context.sessionAgeMinutes <= input.maxAgeMinutes,
});

const matchesResource = (rule: PolicyRule, resource: Resource): boolean =>
  rule.resource === undefined || rule.resource === resource;

const matchesRole = (rule: PolicyRule, actor: Actor): boolean =>
  rule.roles.length === 0 || rule.roles.includes(actor.role);

const matchesPermissions = (rule: PolicyRule, actor: Actor): boolean =>
  rule.permissions.every((value) => can(actor, value));

export const authorize = (input: {
  actor: Actor;
  action: Action;
  resource: Resource;
  context?: AuthContext;
  policies: readonly PolicyRule[];
}): AuthDecision => {
  const context = input.context ?? {};
  const candidates = input.policies.filter(
    (rule) =>
      rule.action === input.action && matchesResource(rule, input.resource),
  );
  let hasRoleMatch = false;

  for (const rule of candidates) {
    if (!matchesRole(rule, input.actor)) continue;
    hasRoleMatch = true;
    if (!matchesPermissions(rule, input.actor)) continue;

    const failed = rule.conditions.find(
      (condition) =>
        !condition.evaluate({
          actor: input.actor,
          action: input.action,
          resource: input.resource,
          context,
        }),
    );

    if (failed !== undefined)
      return denyDecision(failed.denyReason, failed.safeMessage, {
        condition: failed.name,
      });

    return allowDecision(input.actor);
  }

  return denyDecision(
    candidates.length === 0 || hasRoleMatch
      ? 'missing_permission'
      : 'missing_role',
    'You do not have permission to perform this action.',
    { action: input.action, resource: input.resource, role: input.actor.role },
  );
};
