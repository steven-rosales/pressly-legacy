import { createElement } from 'react';
import type {
  LoadPricingCatalogResult,
  PricingChangePlan,
  PublishPricingChangeResult,
} from '@pressly/contracts';
import { err, ok, type AppError, type Result } from '@pressly/errors';
import { makeCliFeature } from '../shell/feature.ts';
import {
  parsePricingCliCommand,
  usage,
  type PricingCliCommand,
} from './args.ts';
import type { PricingAdminClient } from './client.ts';
import { commandError, toPricingChangeInput } from './command.ts';
import {
  makeLocalPricingAdminClient,
  type PricingCliEnv,
} from './local-client.ts';
import { PricingCliView } from './PricingCliView.tsx';
import {
  renderPricingCatalog,
  renderPricingPlan,
  renderPricingPublishResult,
} from './presenter.ts';

type PricingCliOutput =
  | Readonly<{ tag: 'catalog'; value: LoadPricingCatalogResult }>
  | Readonly<{ tag: 'plan'; value: PricingChangePlan }>
  | Readonly<{ tag: 'published'; value: PublishPricingChangeResult }>;

export type PricingCliDeps = Readonly<{
  makePricingAdminClient: (
    env: PricingCliEnv,
  ) => Result<PricingAdminClient, AppError>;
}>;

const defaultDeps: PricingCliDeps = {
  makePricingAdminClient: makeLocalPricingAdminClient,
};

const runPricingCommand = async (
  command: PricingCliCommand,
  client: PricingAdminClient,
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

const presentPricingOutput = (output: PricingCliOutput): string => {
  if (output.tag === 'catalog') return renderPricingCatalog(output.value);
  if (output.tag === 'plan') return renderPricingPlan(output.value);

  return renderPricingPublishResult(output.value);
};

const serializePricingOutput = (output: PricingCliOutput): unknown =>
  output.value;

export const makePricingCli = (deps: PricingCliDeps = defaultDeps) =>
  makeCliFeature<PricingCliCommand, PricingAdminClient, PricingCliOutput>({
    namespace: 'pricing',
    usage,
    parse: parsePricingCliCommand,
    makeClient: deps.makePricingAdminClient,
    run: runPricingCommand,
    present: presentPricingOutput,
    serialize: serializePricingOutput,
    createView: ({ command, client }) =>
      createElement(PricingCliView, {
        command,
        client,
      }),
  });

export const pricingCli = makePricingCli();
