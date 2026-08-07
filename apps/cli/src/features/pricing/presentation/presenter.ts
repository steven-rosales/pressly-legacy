import type {
  LoadPricingCatalogResult,
  PricingChangePlan,
  PublishPricingChangeResult,
} from '@pressly/contracts/pricing';
import { formatMoney } from '@pressly/money';
import type { PricingCliOutput } from '../application/command.ts';

export const renderPricingCatalog = (
  catalog: LoadPricingCatalogResult,
): string => {
  const lines = [
    'Pricing catalog',
    '',
    `Service: ${catalog.serviceSlug}`,
    `Updated: ${catalog.updatedAt}`,
    '',
    'Items:',
  ];

  for (const item of catalog.items) {
    lines.push(
      ` ${item.service}.${item.category}.${item.name} (${item.unit}) - ${formatMoney(item.priceCents, catalog.currency)}`,
    );
  }

  return lines.join('\n');
};

export const renderPricingPublishResult = (
  result: PublishPricingChangeResult,
): string =>
  [
    'Pricing change published',
    '',
    `Old pricing set: ${result.oldPricingSetId}`,
    `New pricing set: ${result.newPricingSetId}`,
    `Audit event: ${result.auditEventId}`,
    `Changed items: ${result.changeItemCount}`,
  ].join('\n');

export const renderPricingPlan = (plan: PricingChangePlan): string => {
  const lines = [
    'Pricing change plan',
    '',
    `Service: ${plan.serviceSlug}`,
    `Reason: ${plan.reason}`,
    `Current pricing set: ${plan.oldPricingSetId}`,
    '',
    'Changes:',
  ];

  for (const change of plan.changes) {
    lines.push(
      ` ${change.code} - ${change.name}`,
      ` old: ${formatMoney(change.oldPriceCents, plan.currency)}`,
      ` new: ${formatMoney(change.newPriceCents, plan.currency)}`,
    );
  }

  return lines.join('\n');
};

export const presentPricingOutput = (output: PricingCliOutput): string => {
  if (output.tag === 'catalog') return renderPricingCatalog(output.value);
  if (output.tag === 'plan') return renderPricingPlan(output.value);

  return renderPricingPublishResult(output.value);
};

export const serializePricingOutput = (output: PricingCliOutput): unknown =>
  output.value;
