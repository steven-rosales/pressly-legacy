import type { Actor } from './actor.ts';
import type { Action } from './action.ts';
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
    context: AuthContext;
  }) => boolean;
}>;

export type PolicyRule = Readonly<{
  action: Action;
  roles: readonly Role[];
  permissions: readonly Permission[];
  conditions: readonly PolicyCondition[];
}>;

export type PolicyBuilder = PolicyRule &
  Readonly<{
    to: (...roles: readonly Role[]) => PolicyBuilder;
    require: (...permissions: readonly Permission[]) => PolicyBuilder;
    when: (...conditions: readonly PolicyCondition[]) => PolicyBuilder;
  }>;

const buildRule = (draft: PolicyRule): PolicyBuilder => ({
  ...draft,
  to: (...roles) => buildRule({ ...draft, roles }),
  require: (...permissions) => buildRule({ ...draft, permissions }),
  when: (...conditions) =>
    buildRule({ ...draft, conditions: [...draft.conditions, ...conditions] }),
});

export const allow = (action: Action): PolicyBuilder =>
  buildRule({ action, roles: [], permissions: [], conditions: [] });

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

const matchesRole = (rule: PolicyRule, actor: Actor): boolean =>
  rule.roles.length === 0 || rule.roles.includes(actor.role);

const matchesPermissions = (rule: PolicyRule, actor: Actor): boolean =>
  rule.permissions.every((value) => can(actor, value));

/**
 * The function's purpose is to answer: _'Given this actor, can they do this action?'_.
 *
 * The `policies` array is just a list of possible rules: `rule 1 OR rule2 OR rule3 ...`, where each rule is independent. The rules usually will come from executing `allow` which will conatin the actore and their roles, permissions, and conditions.
 *
 * **Usage**:
 * ```ts
 * const policies = [
 *   allow(action)
 *    .to(roles)          // optional role gate
 *    .require(perms)     // optional permission gate
 *    .when(conditions)   // optional contextual gate
 * ]
 *
 * const decision = authorize({
 *   actor: { role: 'admin', permissions: ['pricing:publish'] },
 *   action: action: 'pricing:publish',
 *   policies,
 * })
 * ```
 */
export const authorize = (input: {
  actor: Actor;
  action: Action;
  context?: AuthContext;
  policies: readonly PolicyRule[];
}): AuthDecision => {
  const context = input.context ?? {};
  const candidates = input.policies.filter(
    (rule) => rule.action === input.action,
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
    { action: input.action, role: input.actor.role },
  );
};
