import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import type { PricingServiceSlug } from './pricing.ts';

export type PricingChangeAuthor = Readonly<{
  id: string;
  kind: 'human' | 'service';
  displayName: string;
}>;

export type PricingChangeItem = Readonly<{
  code: string;
  priceCents: number;
}>;

export type PricingChangeCommand = Readonly<{
  serviceSlug: PricingServiceSlug;
  reason: string;
  requestedBy: PricingChangeAuthor;
  items: readonly PricingChangeItem[];
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

export type CurrentPricing = Readonly<{
  currentSet: CurrentPricingSet;
  currentItems: readonly CurrentPricingItem[];
}>;

export type PricingChangeDiffItem = Readonly<{
  code: string;
  name: string;
  oldPriceCents: number;
  newPriceCents: number;
}>;

export type PricingChangePlan = Readonly<{
  serviceSlug: PricingServiceSlug;
  reason: string;
  oldPricingSetId: string;
  currency: string;
  changes: readonly PricingChangeDiffItem[];
}>;

export type PublishedPricingChange = Readonly<{
  oldPricingSetId: string;
  newPricingSetId: string;
  auditEventId: string;
  changeItemCount: number;
}>;

export type PricingPolicyViolation = Readonly<
  | {
      code: 'pricing_change_reason_too_short';
      minimumLength: number;
      actualLength: number;
    }
  | { code: 'duplicate_pricing_item_code'; itemCode: string }
  | {
      code: 'invalid_pricing_item_price';
      itemCode: string;
      priceCents: number;
    }
  | { code: 'pricing_item_code_not_found'; itemCode: string }
  | { code: 'pricing_change_has_no_changes' }
>;

export type PricingChangePolicyFailure = Readonly<{
  code: PricingPolicyViolation['code'];
  violations: readonly [PricingPolicyViolation, ...PricingPolicyViolation[]];
}>;

export type PricingChangeReadFailure = Readonly<
  | { code: 'pricing_service_not_found'; serviceSlug: PricingServiceSlug }
  | { code: 'active_pricing_set_not_found'; serviceSlug: PricingServiceSlug }
  | { code: 'multiple_active_pricing_sets'; serviceSlug: PricingServiceSlug }
  | { code: 'active_pricing_set_has_no_items'; pricingSetId: string }
>;

export type PricingChangeCommitFailure =
  | PricingChangeReadFailure
  | Readonly<{
      code: 'pricing_state_changed';
      expectedPricingSetId: string;
      actualPricingSetId: string;
    }>;

export type PricingChangeFailure =
  | PricingChangePolicyFailure
  | PricingChangeCommitFailure;

const minimumReasonLength = 8;
const canBeFree = (itemCode: string): boolean => itemCode === 'delivery_fee';

const isInvalidPrice = (item: PricingChangeItem): boolean =>
  item.priceCents < 0 || (item.priceCents === 0 && !canBeFree(item.code));

const failure = <Value>(
  violations: readonly [PricingPolicyViolation, ...PricingPolicyViolation[]],
): Result<Value, PricingChangePolicyFailure> =>
  result.err({ code: violations[0].code, violations });

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
            { code: 'duplicate_pricing_item_code', itemCode: item.code },
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
  return first === undefined ? result.ok(command) : failure([first, ...rest]);
};

export const makePricingChangePlan = (
  input: Readonly<{
    command: PricingChangeCommand;
    currentSet: CurrentPricingSet;
    currentItems: readonly CurrentPricingItem[];
  }>,
): Result<PricingChangePlan, PricingChangePolicyFailure> => {
  const currentByCode = new Map(
    input.currentItems.map((item) => [item.code, item]),
  );
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
    ...pricingChangeCommandViolations(input.command),
    ...unknownItemViolations,
    ...(changes.length === 0
      ? ([{ code: 'pricing_change_has_no_changes' }] as const)
      : []),
  ];
  const [first, ...rest] = violations;
  return first === undefined ? result.ok(plan) : failure([first, ...rest]);
};
