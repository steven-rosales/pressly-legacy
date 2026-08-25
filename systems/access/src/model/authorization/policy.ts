import type { Action } from './action.ts';
import type { AuthDecision, AuthDenyReason } from './decision.ts';
import { allowDecision, denyDecision } from './decision.ts';
import type { AuthEnvironment } from './environment.ts';
import type { Principal } from '../authentication/principal.ts';
import type { PrincipalAttributes } from './principal-attributes.ts';
import type { AuthResource } from './resource.ts';

export type PolicyInput<R extends AuthResource = AuthResource> = Readonly<{
  principal: Principal;
  principalAttributes: PrincipalAttributes;
  action: Action;
  resource: R;
  environment: AuthEnvironment;
}>;

export type PolicyCondition<R extends AuthResource = AuthResource> = Readonly<{
  name: string;
  denyReason: AuthDenyReason;
  safeMessage: string;
  evaluate: (input: PolicyInput<R>) => boolean;
}>;

export type PolicyRule<R extends AuthResource = AuthResource> = Readonly<{
  id: string;
  action: Action;
  effect: 'allow' | 'deny';
  conditions: readonly PolicyCondition<R>[];
}>;

/**
 * The request shape for authorizing.
 */
export type AuthorizationRequest<R extends AuthResource = AuthResource> =
  PolicyInput<R> & Readonly<{ policies: readonly PolicyRule<R>[] }>;

const allConditionsPass = <R extends AuthResource>(
  rule: PolicyRule<R>,
  input: PolicyInput<R>,
): true | PolicyCondition<R> => {
  const failed = rule.conditions.find(
    (condition) => !condition.evaluate(input),
  );

  return failed ?? true;
};

/**
 * Use after authentication (who are you?) to check if an action can be taken within given attributes, resources, and an environment.
 * @param request the authorization security request context: `{ principal, principleAttributes, action, resource, environment, policies }`
 * @returns the authz decision: `{ tag: 'allowed', policyId } | { tag: 'deny', reason, safeMessage }`
 */
export const authorize = <R extends AuthResource>(
  request: AuthorizationRequest<R>,
): AuthDecision => {
  const policyInput: PolicyInput<R> = {
    principal: request.principal,
    principalAttributes: request.principalAttributes,
    action: request.action,
    resource: request.resource,
    environment: request.environment,
  };

  if (!request.principalAttributes.identityActive)
    return denyDecision({
      reason: 'inactive_identity',
      safeMessage: 'Your account is not active.',
      details: { identityId: request.principal.identityId },
    });

  const candidates = request.policies.filter(
    (policy) => policy.action === request.action,
  );
  let firstFailedAllowCondition:
    | Readonly<{
        policyId: string;
        condition: PolicyCondition<R>;
      }>
    | undefined;

  for (const policy of candidates.filter((rule) => rule.effect === 'deny')) {
    const result = allConditionsPass(policy, policyInput);

    if (result === true)
      return denyDecision({
        reason: 'policy_denied',
        safeMessage: 'You do not have permission to perform this action.',
        policyId: policy.id,
      });
  }

  for (const policy of candidates.filter((rule) => rule.effect === 'allow')) {
    const result = allConditionsPass(policy, policyInput);

    if (result === true) return allowDecision(policy.id);

    firstFailedAllowCondition ??= { policyId: policy.id, condition: result };
  }

  if (firstFailedAllowCondition !== undefined) {
    const failed = firstFailedAllowCondition.condition;

    return denyDecision({
      reason: failed.denyReason,
      safeMessage: failed.safeMessage,
      policyId: firstFailedAllowCondition.policyId,
      details: { condition: failed.name },
    });
  }

  return denyDecision({
    reason: 'missing_assignment',
    safeMessage: 'You do not have permission to perform this action.',
    details: {
      action: request.action,
      resource: request.resource.kind,
      scope: request.resource.scope,
    },
  });
};

/**
 * Use when constructing authorization allow policies for a certain request/vertical
 * @param input data to construct the allow policies
 * @returns the policy to allow an action
 */
export const allow = <R extends AuthResource>(
  input: Readonly<{
    id: string;
    action: Action;
    when: readonly PolicyCondition<R>[];
  }>,
): PolicyRule<R> => ({
  id: input.id,
  action: input.action,
  effect: 'allow',
  conditions: input.when,
});

/**
 * Use when constructing authorization deny policies for a certain request/vertical
 * @param input data to construct the deny policies
 * @returns the policy to deny an action
 */
export const deny = <R extends AuthResource>(
  input: Readonly<{
    id: string;
    action: Action;
    when: readonly PolicyCondition<R>[];
  }>,
): PolicyRule<R> => ({
  id: input.id,
  action: input.action,
  effect: 'deny',
  conditions: input.when,
});
