import type {
  LoadPricingCatalogResult,
  PricingServiceSlug,
  PublishPricingChangeItem,
  PricingChangePlan,
  PublishPricingChangeResult,
} from '@pressly/contracts';
import { err, ok, type AppError, type Result } from '@pressly/errors';
import { commandError } from '../../../shell/command-error.ts';
import type { PricingChangeInput, PricingClient } from './ports.ts';

export type PricingCliAction = 'show' | 'plan' | 'publish';

export type PricingCliCommand = Readonly<{
  action: PricingCliAction;
  serviceSlug: PricingServiceSlug;
  locationSlug?: string;
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
    return err(commandError('--reason is required for pricing changes.'));

  return ok({
    serviceSlug: command.serviceSlug,
    ...(command.locationSlug === undefined
      ? {}
      : { locationSlug: command.locationSlug }),
    reason: command.reason,
    items: [...command.items],
  });
};

export const runPricingCommand = async (
  command: PricingCliCommand,
  client: PricingClient,
): Promise<Result<PricingCliOutput, AppError>> => {
  if (command.action === 'show') {
    const result = await client.loadCatalog({
      serviceSlug: command.serviceSlug,
      ...(command.locationSlug === undefined
        ? {}
        : { locationSlug: command.locationSlug }),
    });

    return result.ok
      ? ok({ tag: 'catalog', value: result.value })
      : err(result.error);
  }

  const input = toPricingChangeInput(command);

  if (!input.ok) return input;

  if (command.action === 'plan') {
    const result = await client.planChange(input.value);

    return result.ok
      ? ok({ tag: 'plan', value: result.value })
      : err(result.error);
  }

  if (!command.confirm)
    return err(commandError('pricing publish requires --yes to commit.'));

  const result = await client.publishChange(input.value);

  return result.ok
    ? ok({ tag: 'published', value: result.value })
    : err(result.error);
};
