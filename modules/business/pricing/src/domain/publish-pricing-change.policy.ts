import type { PricingChangePlan, PricingServiceSlug } from '@pressly/contracts';

export type PricingChangeAuthor = Readonly<{
  id: string;
  kind: 'human' | 'service';
  displayName: string;
}>;

export type PublishPricingChangeItem = Readonly<{
  code: string;
  priceCents: number;
}>;

export type PublishPricingChangeCommand = Readonly<{
  serviceSlug: PricingServiceSlug;
  reason: string;
  requestedBy: PricingChangeAuthor;
  items: readonly PublishPricingChangeItem[];
}>;

export type CurrentPricingSet = Readonly<{
  id: string;
  currency: string;
}>;

export type CurrentPricingItem = Readonly<{
  code: string;
  name: string;
  priceCents: number;
}>;

export type PricingPolicyViolation = DeepReadonly<
  | {
      code: 'pricing_change_reason_too_short';
      minimumLength: number;
      actualLength: number;
    }
  | {
      code: 'duplicate_pricing_item_code';
      itemCode: string;
    }
  | {
      code: 'invalid_pricing_item_price';
      itemCode: string;
      priceCents: number;
    }
  | {
      code: 'pricing_item_code_not_found';
      itemCode: string;
    }
  | {
      code: 'pricing_change_has_no_changes';
    }
>;

export type PricingChangePlanEvaluation = DeepReadonly<
  | { ok: true; plan: PricingChangePlan }
  | {
      ok: false;
      violations: readonly PricingPolicyViolation[];
    }
>;

const canBeFree = (itemCode: string): boolean => itemCode === 'delivery_fee';

const isInvalidPrice = (item: PublishPricingChangeCommand['items'][number]) =>
  item.priceCents < 0 || (item.priceCents === 0 && !canBeFree(item.code));

export const validatePricingCommand = (
  command: PublishPricingChangeCommand,
): readonly PricingPolicyViolation[] => {
  const violations: PricingPolicyViolation[] = [];
  const minimumReasonLength = 8;
  const reasonLength = command.reason.trim().length;

  if (reasonLength < minimumReasonLength)
    violations.push({
      code: 'pricing_change_reason_too_short',
      minimumLength: minimumReasonLength,
      actualLength: reasonLength,
    });

  const seen = new Set<string>();

  for (const item of command.items) {
    if (seen.has(item.code))
      violations.push({
        code: 'duplicate_pricing_item_code',
        itemCode: item.code,
      });

    seen.add(item.code);

    if (isInvalidPrice(item))
      violations.push({
        code: 'invalid_pricing_item_price',
        itemCode: item.code,
        priceCents: item.priceCents,
      });
  }

  return violations;
};

export const validatePricingPlan = (
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
  command: PublishPricingChangeCommand;
  currentSet: CurrentPricingSet;
  currentItems: readonly CurrentPricingItem[];
}): PricingChangePlanEvaluation => {
  const currentByCode = new Map(
    input.currentItems.map((item) => [item.code, item]),
  );
  const violations = [...validatePricingCommand(input.command)];

  const changes = input.command.items.flatMap((change) => {
    const current = currentByCode.get(change.code);

    if (current === undefined) {
      violations.push({
        code: 'pricing_item_code_not_found',
        itemCode: change.code,
      });

      return [];
    }

    if (current.priceCents === change.priceCents) return [];

    return [
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

  violations.push(...validatePricingPlan(plan));

  if (violations.length > 0) return { ok: false, violations };

  return { ok: true, plan };
};
