import type {
  AuthResource,
  PolicyRule,
} from '@pressly/access-system/authorization';

export type PolicyContractObservation = Readonly<{
  id: string;
  action: string;
  effect: 'allow' | 'deny';
  conditions: readonly Readonly<{
    name: string;
    denyReason: string;
    safeMessage: string;
  }>[];
}>;

export const observePolicyContracts = <Resource extends AuthResource>(
  policies: readonly PolicyRule<Resource>[],
): readonly PolicyContractObservation[] =>
  policies.map((policy) => ({
    id: policy.id,
    action: policy.action,
    effect: policy.effect,
    conditions: policy.conditions.map((condition) => ({
      name: condition.name,
      denyReason: condition.denyReason,
      safeMessage: condition.safeMessage,
    })),
  }));
