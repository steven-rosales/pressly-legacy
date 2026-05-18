import type { PricingChangePlan } from '@pressly/contracts';

const formatMoney = (cents: number, currency: string): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);

export const renderPricingChangePlan = (plan: PricingChangePlan): string => {
  const scope = plan.locationSlug ?? 'global';

  return [
    'Pricing change plan',
    '',
    `Service: ${plan.serviceSlug}`,
    `Scope: ${scope}`,
    `Reason: ${plan.reason}`,
    `Current pricing set: ${plan.oldPricingSetId}`,
    '',
    'Changes:',
    ...plan.changes.flatMap((i) => [
      ` ${i.code} - ${i.name}`,
      ` old: ${formatMoney(i.oldPriceCents, plan.currency)}`,
      ` new: ${formatMoney(i.newPriceCents, plan.currency)}`,
    ]),
  ].join('\n');
};
