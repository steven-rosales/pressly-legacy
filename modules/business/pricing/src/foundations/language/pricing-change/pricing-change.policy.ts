import { result, type Result } from '@pressly/kernel';
import type {
  PricingChangePolicyFailure,
  PricingPolicyViolation,
} from './pricing-change.failure.ts';
import type {
  CurrentPricingItem,
  CurrentPricingSet,
  PricingChangeCommand,
  PricingChangePlan,
} from './pricing-change.model.ts';

const minimumReasonLength = 8;

const canBeFree = (itemCode: string): boolean => itemCode === 'delivery_fee';

const isInvalidPrice = (item: PricingChangeCommand['items'][number]): boolean =>
  item.priceCents < 0 || (item.priceCents === 0 && !canBeFree(item.code));

const toPolicyFailure = (
  violations: readonly [PricingPolicyViolation, ...PricingPolicyViolation[]],
): PricingChangePolicyFailure => ({
  code: violations[0].code,
  violations,
});

const failWith = <Value>(
  violations: readonly [PricingPolicyViolation, ...PricingPolicyViolation[]],
): Result<Value, PricingChangePolicyFailure> =>
  result.err(toPolicyFailure(violations));

export const pricingChangeCommandViolations = (
  command: PricingChangeCommand,
): readonly PricingPolicyViolation[] => {
  const reasonLength = command.reason.trim().length;
  const reasonViolations: readonly PricingPolicyViolation[] =
    reasonLength < minimumReasonLength
      ? [
          {
            code: 'pricing_change_reason_too_short',
            minimumLength: minimumReasonLength,
            actualLength: reasonLength,
          },
        ]
      : [];

  const seen = new Set<string>();
  const itemViolations = command.items.flatMap((item) => {
    const duplicate = seen.has(item.code);
    seen.add(item.code);

    return [
      ...(duplicate
        ? ([
            {
              code: 'duplicate_pricing_item_code',
              itemCode: item.code,
            },
          ] as const)
        : []),
      ...(isInvalidPrice(item)
        ? ([
            {
              code: 'invalid_pricing_item_price',
              itemCode: item.code,
              priceCents: item.priceCents,
            },
          ] as const)
        : []),
    ];
  });

  return [...reasonViolations, ...itemViolations];
};

export const validatePricingChangeCommand = (
  command: PricingChangeCommand,
): Result<PricingChangeCommand, PricingChangePolicyFailure> => {
  const violations = pricingChangeCommandViolations(command);
  const [first, ...rest] = violations;

  return first === undefined ? result.ok(command) : failWith([first, ...rest]);
};

export const pricingChangePlanViolations = (
  plan: PricingChangePlan,
): readonly PricingPolicyViolation[] =>
  plan.changes.length > 0
    ? []
    : [
        {
          code: 'pricing_change_has_no_changes',
        },
      ];

export const makePricingChangePlan = (input: {
  command: PricingChangeCommand;
  currentSet: CurrentPricingSet;
  currentItems: readonly CurrentPricingItem[];
}): Result<PricingChangePlan, PricingChangePolicyFailure> => {
  const currentByCode = new Map(
    input.currentItems.map((item) => [item.code, item]),
  );
  const commandViolations = pricingChangeCommandViolations(input.command);
  const unknownItemViolations: PricingPolicyViolation[] = [];
  const changes = input.command.items.flatMap((change) => {
    const current = currentByCode.get(change.code);

    if (current === undefined) {
      unknownItemViolations.push({
        code: 'pricing_item_code_not_found',
        itemCode: change.code,
      });
      return [];
    }

    return current.priceCents === change.priceCents
      ? []
      : [
          {
            code: current.code,
            name: current.name,
            oldPriceCents: current.priceCents,
            newPriceCents: change.priceCents,
          },
        ];
  });
  const plan: PricingChangePlan = {
    serviceSlug: input.command.serviceSlug,
    reason: input.command.reason,
    oldPricingSetId: input.currentSet.id,
    currency: input.currentSet.currency,
    changes,
  };
  const violations = [
    ...commandViolations,
    ...unknownItemViolations,
    ...pricingChangePlanViolations(plan),
  ];
  const [first, ...rest] = violations;

  return first === undefined ? result.ok(plan) : failWith([first, ...rest]);
};
