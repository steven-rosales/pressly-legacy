import { result, type Result } from '@pressly/kernel';
import type {
  LoadPricingCatalogResult,
  PricingServiceSlug,
  PublishPricingChangeItem,
  PricingChangePlan,
  PublishPricingChangeResult,
} from '@pressly/contracts/pricing';
import { type AppError } from '@pressly/errors/app-error';
import { commandError } from '../../../shell/command-error.ts';
import type { PricingChangeInput, PricingClient } from './ports.ts';

export type PricingCliAction = 'show' | 'plan' | 'publish';

export type PricingCliCommand = Readonly<{
  action: PricingCliAction;
  serviceSlug: PricingServiceSlug;
  reason?: string;
  items: readonly PublishPricingChangeItem[];
  confirm: boolean;
  json: boolean;
}>;

export type PricingCliOutput =
  | Readonly<{ tag: 'catalog'; value: LoadPricingCatalogResult }>
  | Readonly<{ tag: 'plan'; value: PricingChangePlan }>
  | Readonly<{ tag: 'published'; value: PublishPricingChangeResult }>;

export const toPricingChangeInput = (
  command: PricingCliCommand,
): Result<PricingChangeInput, AppError> => {
  if (command.reason === undefined)
    return result.err(
      commandError('--reason is required for pricing changes.'),
    );

  return result.ok({
    serviceSlug: command.serviceSlug,
    reason: command.reason,
    items: [...command.items],
  });
};

export const runPricingCommand = async (
  command: PricingCliCommand,
  client: PricingClient,
): Promise<Result<PricingCliOutput, AppError>> => {
  if (command.action === 'show') {
    const catalogResult = await client.loadCatalog({
      serviceSlug: command.serviceSlug,
    });

    return result.isOk(catalogResult)
      ? result.ok({ tag: 'catalog', value: catalogResult.value })
      : result.err(catalogResult.error);
  }

  const input = toPricingChangeInput(command);

  if (result.isErr(input)) return input;

  if (command.action === 'plan') {
    const planResult = await client.planChange(input.value);

    return result.isOk(planResult)
      ? result.ok({ tag: 'plan', value: planResult.value })
      : result.err(planResult.error);
  }

  if (!command.confirm)
    return result.err(
      commandError('pricing publish requires --yes to commit.'),
    );

  const publishResult = await client.publishChange(input.value);

  return result.isOk(publishResult)
    ? result.ok({ tag: 'published', value: publishResult.value })
    : result.err(publishResult.error);
};
