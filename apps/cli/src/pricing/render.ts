import type {
  LoadPricingCatalogResult,
  PricingChangePlan,
  PublishPricingChangeResult,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import { formatMoney } from './money.ts';

export const renderPricingCatalog = (
  catalog: LoadPricingCatalogResult,
): string => {
  const scope = catalog.locationSlug ?? 'global';
  const lines = [
    'Pricing catalog',
    '',
    `Service: ${catalog.serviceSlug}`,
    `Scope: ${scope}`,
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
  const scope = plan.locationSlug ?? 'global';
  const lines = [
    'Pricing change plan',
    '',
    `Service: ${plan.serviceSlug}`,
    `Scope: ${scope}`,
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

export const renderAppError = (error: AppError): string =>
  [
    error.safeMessage,
    '',
    `code: ${error.code}`,
    `kind: ${error.kind}`,
    `message: ${error.message}`,
  ].join('\n');
